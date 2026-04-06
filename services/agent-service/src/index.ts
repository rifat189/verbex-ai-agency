import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import {
  createAgent,
  listAgents,
  getAgent,
  getPublicAgent,
  deleteAgent,
  generateApiKey,
  getApiKeyStatus,
} from "./modules/agent/service.js";

const AUTH_SERVICE_URL =
  process.env.AUTH_SERVICE_URL ?? "http://localhost:8081";
const CHAT_SERVICE_URL =
  process.env.CHAT_SERVICE_URL ?? "http://localhost:8083";

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
  } catch {
    return null;
  }
}

const app = new Hono();
app.use("*", cors({ origin: "*" }));

app.get("/health", (c) => c.json({ status: "ok" }));

// API Key routes
app.post("/apikeys", async (c) => {
  const userId = await requireAuth(c);
  if (!userId) return c.json({ error: "Unauthorized" }, 401);
  const rawKey = await generateApiKey(userId);
  return c.json({ data: { key: rawKey } });
});

app.get("/apikeys", async (c) => {
  const userId = await requireAuth(c);
  if (!userId) return c.json({ error: "Unauthorized" }, 401);
  const status = await getApiKeyStatus(userId);
  return c.json({ data: status });
});

// Public agent (no auth) - must be before /:id
app.get("/agents/public/:id", async (c) => {
  const id = c.req.param("id");
  const ag = await getPublicAgent(id);
  if (!ag) return c.json({ error: "Agent not found" }, 404);
  return c.json({
    data: {
      id: ag.id,
      name: ag.name,
      system_prompt: ag.systemPrompt,
      temperature: ag.temperature,
      model: ag.model,
      webhook_url: ag.webhookUrl,
    },
  });
});

// Analytics
app.get("/agents/:id/analytics", async (c) => {
  const userId = await requireAuth(c);
  if (!userId) return c.json({ error: "Unauthorized" }, 401);
  const id = c.req.param("id");
  const ag = await getAgent(id, userId);
  if (!ag) return c.json({ error: "Agent not found" }, 404);
  try {
    const res = await fetch(
      `${CHAT_SERVICE_URL}/conversations/${id}/analytics`
    );
    if (!res.ok)
      return c.json({
        data: { totalConversations: 0, totalMessages: 0, lastActivity: null },
      });
    const json = (await res.json()) as any;
    return c.json({ data: json.data });
  } catch {
    return c.json({
      data: { totalConversations: 0, totalMessages: 0, lastActivity: null },
    });
  }
});

// CRUD
app.post("/agents", async (c) => {
  const userId = await requireAuth(c);
  if (!userId) return c.json({ error: "Unauthorized" }, 401);
  const body = await c.req.json().catch(() => null);
  if (!body?.name || !body?.system_prompt)
    return c.json({ error: "name and system_prompt are required" }, 400);
  const newAgent = await createAgent(userId, body);
  return c.json({ data: { agent: newAgent } }, 201);
});

app.get("/agents", async (c) => {
  const userId = await requireAuth(c);
  if (!userId) return c.json({ error: "Unauthorized" }, 401);
  const agents = await listAgents(userId);
  return c.json({ data: { agents } });
});

app.get("/agents/:id", async (c) => {
  const userId = await requireAuth(c);
  if (!userId) return c.json({ error: "Unauthorized" }, 401);
  const id = c.req.param("id");
  const ag = await getAgent(id, userId);
  if (!ag) return c.json({ error: "Agent not found" }, 404);
  return c.json({ data: { agent: ag } });
});

app.delete("/agents/:id", async (c) => {
  const userId = await requireAuth(c);
  if (!userId) return c.json({ error: "Unauthorized" }, 401);
  const id = c.req.param("id");
  const deleted = await deleteAgent(id, userId);
  if (!deleted) return c.json({ error: "Agent not found" }, 404);
  return new Response(null, { status: 204 });
});

const PORT = 8082;
serve({ fetch: app.fetch, port: PORT }, () => {
  console.log(`agent-service running on port ${PORT}`);
});

// PATCH /agents/:id — update agent
app.patch("/agents/:id", async (c) => {
  const userId = await requireAuth(c);
  if (!userId) return c.json({ error: "Unauthorized" }, 401);
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => null);
  if (!body) return c.json({ error: "Body required" }, 400);
  const { updateAgent } = await import("./modules/agent/service.js");
  const updated = await updateAgent(id, userId, body);
  if (!updated) return c.json({ error: "Agent not found" }, 404);
  return c.json({ data: { agent: updated } });
});
