import { eq, desc } from "drizzle-orm";
import { db } from "../../lib/db.js";
import { conversations, messages } from "./schema.js";
import { generateReply } from "../../lib/llm.js";

const AGENT_SERVICE_URL = process.env.AGENT_SERVICE_URL ?? "http://localhost:8082";
const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL ?? "http://localhost:8081";

// Injected at end of every system prompt
const FOLLOWUP_INSTRUCTION = `

At the very end of your response, add one line in this exact format:
FOLLOWUPS:["Tell me more about X","Explain how Y works","Show an example of Z"]
Replace X, Y, Z with topics relevant to your response. Keep each under 8 words. No questions. No extra text after the line.`;

// Match any line starting with FOLLOWUPS (with or without colon, brackets, etc.)
const FOLLOWUPS_RE = /^FOLLOW/i;  // catch FOLLOWUPS, FOLLOW-UPS, FOLLOW UP, FOLLOW etc.

// Strip FOLLOWUPS line(s) from content before saving/displaying
export function stripFollowUps(content: string): { clean: string; followUps: string[] } {
  const lines = content.split("\n");
  const followUpLineIdx = lines.findIndex(l => FOLLOWUPS_RE.test(l.trimStart()));
  if (followUpLineIdx === -1) return { clean: content.trim(), followUps: [] };

  // Everything before the FOLLOWUPS line is clean content
  const clean = lines.slice(0, followUpLineIdx).join("\n").trim();

  // Try to parse JSON array from the FOLLOWUPS line and any subsequent lines
  const remainder = lines.slice(followUpLineIdx).join(" ");
  try {
    const match = remainder.match(/\[[\s\S]*?\]/);
    if (match) {
      const parsed = JSON.parse(match[0]);
      if (Array.isArray(parsed)) return { clean, followUps: parsed.slice(0, 3).map(String) };
    }
  } catch {}
  return { clean, followUps: [] };
}

export async function getPublicAgent(agentId: string) {
  const res = await fetch(`${AGENT_SERVICE_URL}/agents/public/${agentId}`);
  if (!res.ok) return null;
  const json = (await res.json()) as any;
  return json.data ?? null;
}

export async function verifyApiKey(rawKey: string) {
  const res = await fetch(`${AUTH_SERVICE_URL}/auth/verify-apikey`, {
    headers: { "x-api-key": rawKey },
  });
  if (!res.ok) return null;
  const json = (await res.json()) as any;
  return json.data?.userId ?? null;
}

export async function chat(agentId: string, message: string, conversationId?: string) {
  const agent = await getPublicAgent(agentId);
  if (!agent) throw new Error("Agent not found");

  let convId = conversationId;
  let isNew = false;

  if (!convId) {
    const [conv] = await db.insert(conversations).values({ agentId }).returning();
    convId = conv.id;
    isNew = true;
  }

  if (isNew && agent.webhook_url) {
    fetch(agent.webhook_url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agentId, conversationId: convId }),
    }).catch(() => {});
  }

  await db.insert(messages).values({ conversationId: convId, role: "user", content: message });

  const history = await db
    .select().from(messages)
    .where(eq(messages.conversationId, convId!))
    .orderBy(desc(messages.createdAt)).limit(10);

  const msgArray = [
    { role: "system", content: agent.system_prompt + FOLLOWUP_INSTRUCTION },
    ...history.reverse().map((m: any) => ({ role: m.role, content: m.content })),
  ];

  const rawReply = await generateReply(msgArray, agent.model, parseFloat(agent.temperature ?? "0.7"));
  const { clean, followUps } = stripFollowUps(rawReply);

  // Save clean content (no FOLLOWUPS line)
  await db.insert(messages).values({ conversationId: convId, role: "assistant", content: clean });

  return { reply: clean, followUps, conversationId: convId };
}

export async function getConversationsForAgent(agentId: string) {
  const convs = await db
    .select().from(conversations)
    .where(eq(conversations.agentId, agentId))
    .orderBy(desc(conversations.startedAt));

  return Promise.all(convs.map(async (conv) => {
    const msgs = await db.select().from(messages)
      .where(eq(messages.conversationId, conv.id))
      .orderBy(messages.createdAt);
    const firstMessage = msgs.find((m) => m.role === "user")?.content ?? "";
    return {
      id: conv.id,
      startedAt: conv.startedAt,
      messageCount: msgs.length,
      firstMessage: firstMessage.length > 100 ? firstMessage.slice(0, 100) + "..." : firstMessage,
    };
  }));
}

export async function getMessages(conversationId: string) {
  const msgs = await db.select().from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(messages.createdAt);
  return msgs.map((m) => ({ role: m.role, content: m.content, createdAt: m.createdAt }));
}

export async function getAnalytics(agentId: string) {
  const convs = await db.select().from(conversations).where(eq(conversations.agentId, agentId));
  const totalConversations = convs.length;
  if (totalConversations === 0) return { totalConversations: 0, totalMessages: 0, lastActivity: null };

  let totalMessages = 0;
  let lastActivity: Date | null = null;
  for (const conv of convs) {
    const msgs = await db.select().from(messages).where(eq(messages.conversationId, conv.id));
    totalMessages += msgs.length;
    for (const m of msgs) {
      if (m.createdAt && (!lastActivity || m.createdAt > lastActivity)) lastActivity = m.createdAt;
    }
  }
  return { totalConversations, totalMessages, lastActivity };
}

export async function prepareStreamContext(agentId: string, message: string, conversationId?: string) {
  const agent = await getPublicAgent(agentId);
  if (!agent) throw new Error("Agent not found");

  let convId = conversationId;
  let isNew = false;

  if (!convId) {
    const [conv] = await db.insert(conversations).values({ agentId }).returning();
    convId = conv.id;
    isNew = true;
  }

  if (isNew && agent.webhook_url) {
    fetch(agent.webhook_url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agentId, conversationId: convId }),
    }).catch(() => {});
  }

  await db.insert(messages).values({ conversationId: convId, role: "user", content: message });

  const history = await db
    .select().from(messages)
    .where(eq(messages.conversationId, convId!))
    .orderBy(desc(messages.createdAt)).limit(10);

  const msgArray = [
    // Inject follow-up instruction into system prompt
    { role: "system", content: agent.system_prompt + FOLLOWUP_INSTRUCTION },
    ...history.reverse().map((m: any) => ({ role: m.role, content: m.content })),
  ];

  return { agent, conversationId: convId!, messages: msgArray };
}

export async function saveStreamedReply(conversationId: string, content: string) {
  // Strip follow-ups before saving to DB
  const { clean } = stripFollowUps(content);
  await db.insert(messages).values({ conversationId, role: "assistant", content: clean });
}