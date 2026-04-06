import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import {
  chat,
  getConversationsForAgent,
  getMessages,
  getAnalytics,
  verifyApiKey,
  prepareStreamContext,
  saveStreamedReply,
  stripFollowUps,
} from "./modules/chat/service.js";
import { generateReplyStream } from "./lib/llm.js";

const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL ?? "http://localhost:8081";

async function requireAuth(c: any): Promise<string | null> {
  const authHeader = c.req.header("Authorization");
  const token = authHeader?.split(" ")[1];
  if (!token) return null;
  try {
    const res = await fetch(`${AUTH_SERVICE_URL}/auth/verify`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as any;
    return json.data?.userId ?? null;
  } catch { return null; }
}

const app = new Hono();
app.use("*", cors({ origin: "*" }));
app.get("/health", (c) => c.json({ status: "ok" }));

// POST /chat — standard
app.post("/chat", async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body?.agentId || !body?.message) return c.json({ error: "agentId and message are required" }, 400);
  const rawApiKey = c.req.header("x-api-key");
  if (rawApiKey) {
    const userId = await verifyApiKey(rawApiKey);
    if (!userId) return c.json({ error: "Invalid API key" }, 401);
  }
  try {
    const result = await chat(body.agentId, body.message, body.conversationId);
    return c.json({ data: result });
  } catch (e: any) { return c.json({ error: e.message }, 400); }
});

// POST /chat/stream — SSE with follow-ups embedded
app.post("/chat/stream", async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body?.agentId || !body?.message) return c.json({ error: "agentId and message are required" }, 400);

  const rawApiKey = c.req.header("x-api-key");
  if (rawApiKey) {
    const userId = await verifyApiKey(rawApiKey);
    if (!userId) return c.json({ error: "Invalid API key" }, 401);
  }

  try {
    const ctx = await prepareStreamContext(body.agentId, body.message, body.conversationId);
    const stream = await generateReplyStream(ctx.messages, ctx.agent.model, parseFloat(ctx.agent.temperature ?? "0.7"));

    const encoder = new TextEncoder();
    const convIdHeader = ctx.conversationId;
    let fullReply = "";

    const transformedStream = new ReadableStream<Uint8Array>({
      async start(controller) {
        // Send conversationId first
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ conversationId: convIdHeader })}\n\n`));

        const reader = stream.getReader();
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const text = new TextDecoder().decode(value);

            // Collect tokens
            const tokenMatches = text.match(/data: ({.*?})\n\n/g);
            if (tokenMatches) {
              for (const t of tokenMatches) {
                try {
                  const parsed = JSON.parse(t.replace("data: ", "").trim());
                  if (parsed.token) fullReply += parsed.token;
                } catch {}
              }
            }

            // Check if the accumulated reply now has a FOLLOWUPS line starting
            // If so, suppress streaming that line to the client
            const lines = fullReply.split("\n");
            const followUpLineIdx = lines.findIndex(l => /^FOLLOW/i.test(l.trimStart()));

            if (followUpLineIdx !== -1) {
              // Don't forward tokens that are part of the FOLLOWUPS line
              // Just keep collecting silently
              continue;
            }

            // Forward token to client
            controller.enqueue(value);
          }
        } finally {
          reader.releaseLock();

          // Parse follow-ups from full reply
          const { clean, followUps } = stripFollowUps(fullReply);

          // Save clean content to DB
          if (clean) await saveStreamedReply(convIdHeader, clean).catch(() => {});

          // Send follow-ups as final SSE event
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ followUps })}\n\n`)
          );
          controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
          controller.close();
        }
      },
    });

    return new Response(transformedStream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "X-Conversation-Id": convIdHeader,
      },
    });
  } catch (e: any) { return c.json({ error: e.message }, 400); }
});

// Analytics (internal)
app.get("/conversations/:agentId/analytics", async (c) => {
  const agentId = c.req.param("agentId");
  const analytics = await getAnalytics(agentId);
  return c.json({ data: analytics });
});

app.get("/conversations/:agentId", async (c) => {
  const agentId = c.req.param("agentId");
  const userId = await requireAuth(c);
  if (!userId) return c.json({ error: "Unauthorized" }, 401);
  const convs = await getConversationsForAgent(agentId);
  return c.json({ data: convs });
});

app.get("/conversations/:conversationId/messages", async (c) => {
  const conversationId = c.req.param("conversationId");
  const userId = await requireAuth(c);
  if (!userId) return c.json({ error: "Unauthorized" }, 401);
  const msgs = await getMessages(conversationId);
  return c.json({ data: { messages: msgs } });
});

const PORT = 8083;
serve({ fetch: app.fetch, port: PORT }, () => {
  console.log(`chat-service running on port ${PORT}`);
});
