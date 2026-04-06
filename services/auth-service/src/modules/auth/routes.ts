import { Hono } from "hono";
import { signup, login, verifyToken } from "./service.js";
import { db } from "../../lib/db.js";
import crypto from "crypto";
import { sql } from "drizzle-orm";

const auth = new Hono();

auth.post("/signup", async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body?.email || !body?.password) {
    return c.json({ error: "Email and password are required" }, 400);
  }
  try {
    const result = await signup(body.email, body.password);
    return c.json({ data: result });
  } catch (e: any) {
    return c.json({ error: e.message }, 400);
  }
});

auth.post("/login", async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body?.email || !body?.password) {
    return c.json({ error: "Email and password are required" }, 400);
  }
  try {
    const result = await login(body.email, body.password);
    return c.json({ data: result });
  } catch (e: any) {
    return c.json({ error: e.message }, 401);
  }
});

auth.get("/verify", async (c) => {
  const authHeader = c.req.header("Authorization");
  const token = authHeader?.split(" ")[1];
  if (!token) return c.json({ error: "No token provided" }, 401);
  try {
    const payload = verifyToken(token);
    return c.json({ data: payload });
  } catch {
    return c.json({ error: "Invalid or expired token" }, 401);
  }
});

auth.get("/verify-apikey", async (c) => {
  const rawKey = c.req.header("x-api-key");
  if (!rawKey) return c.json({ error: "No API key provided" }, 401);

  const hash = crypto.createHash("sha256").update(rawKey).digest("hex");

  try {
    // api_keys table is owned by agent-service but we share the same DB
    const result = await db.execute(
      sql`SELECT user_id FROM api_keys WHERE key_hash = ${hash} LIMIT 1`
    );
    const rows = (result as any).rows ?? [];
    if (!rows || rows.length === 0) {
      return c.json({ error: "Invalid API key" }, 401);
    }
    return c.json({ data: { userId: rows[0].user_id } });
  } catch {
    return c.json({ error: "Invalid API key" }, 401);
  }
});

export default auth;
