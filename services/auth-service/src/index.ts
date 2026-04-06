import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import authRoutes from "./modules/auth/routes.js";

const app = new Hono();

app.use("*", cors({ origin: "*" }));

app.route("/auth", authRoutes);

app.get("/health", (c) => c.json({ status: "ok" }));

const PORT = 8081;
serve({ fetch: app.fetch, port: PORT }, () => {
  console.log(`auth-service running on port ${PORT}`);
});
