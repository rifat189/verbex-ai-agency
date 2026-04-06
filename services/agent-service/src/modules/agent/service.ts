import { eq, and } from "drizzle-orm";
import crypto from "crypto";
import { db } from "../../lib/db.js";
import { agents, apiKeys } from "./schema.js";

export async function createAgent(
  userId: string,
  data: {
    name: string;
    system_prompt: string;
    temperature?: number;
    model?: string;
    webhook_url?: string;
  }
) {
  const [agent] = await db
    .insert(agents)
    .values({
      userId,
      name: data.name,
      systemPrompt: data.system_prompt,
      temperature: data.temperature?.toString() ?? "0.7",
      model: data.model ?? "stepfun-ai/step-3.5-flash:free",
      webhookUrl: data.webhook_url ?? null,
    })
    .returning();
  return agent;
}

export async function listAgents(userId: string) {
  return db.select().from(agents).where(eq(agents.userId, userId));
}

export async function getAgent(id: string, userId: string) {
  const [agent] = await db
    .select()
    .from(agents)
    .where(and(eq(agents.id, id), eq(agents.userId, userId)))
    .limit(1);
  return agent ?? null;
}

export async function getPublicAgent(id: string) {
  const [agent] = await db
    .select()
    .from(agents)
    .where(eq(agents.id, id))
    .limit(1);
  return agent ?? null;
}

export async function deleteAgent(id: string, userId: string) {
  const result = await db
    .delete(agents)
    .where(and(eq(agents.id, id), eq(agents.userId, userId)))
    .returning();
  return result.length > 0;
}

export async function generateApiKey(userId: string) {
  const rawKey = crypto.randomUUID() + "-" + crypto.randomUUID();
  const keyHash = crypto.createHash("sha256").update(rawKey).digest("hex");

  // Upsert: delete existing then insert
  await db.delete(apiKeys).where(eq(apiKeys.userId, userId));
  await db.insert(apiKeys).values({ userId, keyHash });

  return rawKey;
}

export async function getApiKeyStatus(userId: string) {
  const [key] = await db
    .select()
    .from(apiKeys)
    .where(eq(apiKeys.userId, userId))
    .limit(1);
  if (!key) return { hasKey: false };
  return { hasKey: true, createdAt: key.createdAt };
}

export async function updateAgent(
  id: string,
  userId: string,
  data: {
    name?: string;
    system_prompt?: string;
    temperature?: number;
    model?: string;
    webhook_url?: string;
  }
) {
  const updates: any = {};
  if (data.name) updates.name = data.name;
  if (data.system_prompt) updates.systemPrompt = data.system_prompt;
  if (data.temperature !== undefined) updates.temperature = data.temperature.toString();
  if (data.model) updates.model = data.model;
  if ("webhook_url" in data) updates.webhookUrl = data.webhook_url ?? null;

  const [updated] = await db
    .update(agents)
    .set(updates)
    .where(and(eq(agents.id, id), eq(agents.userId, userId)))
    .returning();
  return updated ?? null;
}
