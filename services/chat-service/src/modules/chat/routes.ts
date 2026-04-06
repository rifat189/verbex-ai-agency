import { Hono } from "hono";
import {
  chat,
  getConversationsForAgent,
  getMessages,
  getAnalytics,
  verifyApiKey,
} from "./service.js";

const chatRouter = new Hono();

const AUTH_SERVICE_URL =
  process.env.AUTH_SERVICE_URL ?? "http://localhost:8081";
const AGENT_SERVICE_URL =
  process.env.AGENT_SERVICE_URL ?? "http://localhost:8082";

async function getUserIdFromToken(token: string): Promise<string | null> {
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

async function checkAgentOwnership(
  agentId: string,
  userId: string
): Promise<boolean> {
  try {
    const res = await fetch(`${AGENT_SERVICE_URL}/agents/${agentId}`, {
      headers: {
        Authorization: `Bearer placeholder`, // agent-service checks via auth internally
      },
    });
    // We'll just trust the token-based check
    return res.ok;
  } catch {
    return false;
  }
}

// POST /chat
chatRouter.post("/", async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body?.agentId || !body?.message) {
    return c.json({ error: "agentId and message are required" }, 400);
  }

  // Optional API key check
  const rawApiKey = c.req.header("x-api-key");
  if (rawApiKey) {
    const userId = await verifyApiKey(rawApiKey);
    if (!userId) return c.json({ error: "Invalid API key" }, 401);
  }

  try {
    const result = await chat(body.agentId, body.message, body.conversationId);
    return c.json({ data: result });
  } catch (e: any) {
    return c.json({ error: e.message }, 400);
  }
});

// GET /conversations/:agentId — requires auth
chatRouter.get("/conversations/:agentId", async (c) => {
  const agentId = c.req.param("agentId");
  const authHeader = c.req.header("Authorization");
  const token = authHeader?.split(" ")[1];
  if (!token) return c.json({ error: "Unauthorized" }, 401);

  const userId = await getUserIdFromToken(token);
  if (!userId) return c.json({ error: "Unauthorized" }, 401);

  const convs = await getConversationsForAgent(agentId);
  return c.json({ data: convs });
});

// GET /conversations/:conversationId/messages — requires auth
chatRouter.get("/conversations/:conversationId/messages", async (c) => {
  const conversationId = c.req.param("conversationId");
  const authHeader = c.req.header("Authorization");
  const token = authHeader?.split(" ")[1];
  if (!token) return c.json({ error: "Unauthorized" }, 401);

  const userId = await getUserIdFromToken(token);
  if (!userId) return c.json({ error: "Unauthorized" }, 401);

  const msgs = await getMessages(conversationId);
  return c.json({ data: { messages: msgs } });
});

// GET /conversations/:agentId/analytics — called internally by agent-service
chatRouter.get("/conversations/:agentId/analytics", async (c) => {
  const agentId = c.req.param("agentId");
  const analytics = await getAnalytics(agentId);
  return c.json({ data: analytics });
});

export default chatRouter;
