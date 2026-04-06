# AgentForge — AI Agent Management Platform

A SaaS platform where users sign up, create AI chatbot "agents", and embed them on any website via an iframe.

---

## Architecture Diagram

```
                          ┌─────────────┐
                          │   Browser   │
                          │  (Next.js)  │
                          │  :3000      │
                          └──────┬──────┘
                                 │ HTTP
              ┌──────────────────┼──────────────────┐
              │                  │                  │
              ▼                  ▼                  ▼
    ┌──────────────┐   ┌──────────────┐   ┌──────────────┐
    │ auth-service │   │agent-service │   │ chat-service │
    │   :8081      │◄──│   :8082      │◄──│   :8083      │
    └──────┬───────┘   └──────┬───────┘   └──────┬───────┘
           │                  │                  │
           └──────────────────┼──────────────────┘
                              │ SQL (Drizzle ORM)
                              ▼
                    ┌──────────────────┐
                    │     NeonDB       │
                    │ (Serverless PG)  │
                    └──────────────────┘
                                            ┌──────────────┐
                    chat-service ──────────►│  OpenRouter  │
                                            │  (Free LLMs) │
                                            └──────────────┘
```

**Inter-service calls:**
- `chat-service` → `agent-service /agents/public/:id` — validate agent before chat
- `chat-service` → `auth-service /auth/verify-apikey` — validate programmatic API key
- `agent-service` → `chat-service /conversations/:id/analytics` — fetch analytics data

---

## Setup Instructions

### Prerequisites

- Node.js 20+
- pnpm (`npm install -g pnpm`)
- Docker + Docker Compose (for Docker path)
- A [NeonDB](https://neon.tech) account (free tier works)
- An [OpenRouter](https://openrouter.ai) account (free, no credit card needed for free models)

### Step 1: Clone & Configure

```bash
git clone <repo-url>
cd agentforge
cp .env.example .env
```

Edit `.env` and fill in:
- `DATABASE_URL` — your Neon connection string (from Neon dashboard → Connection Details)
- `JWT_SECRET` — any long random string (e.g. `openssl rand -hex 32`)
- `OPENROUTER_API_KEY` — from [openrouter.ai/keys](https://openrouter.ai/keys)

### Step 2: Initialize the Database

Run the migration SQL once against your NeonDB:

```bash
# Option A: paste into the Neon SQL editor in the dashboard
cat migrate.sql

# Option B: run via psql
psql "$DATABASE_URL" -f migrate.sql
```

### Path A: Docker (recommended)

```bash
docker-compose up --build
```

All four services start automatically. Visit `http://localhost:3000`.

### Path B: Manual `pnpm dev` (each service in a separate terminal)

```bash
# Terminal 1 — auth-service
cd services/auth-service
pnpm install
pnpm dev

# Terminal 2 — agent-service
cd services/agent-service
pnpm install
pnpm dev

# Terminal 3 — chat-service
cd services/chat-service
pnpm install
pnpm dev

# Terminal 4 — frontend
cd frontend
pnpm install
pnpm dev
```

Visit `http://localhost:3000`.

> **Note:** When running manually, the inter-service URLs default to `localhost`. Make sure all four are running before using the frontend.

---

## API Documentation

All error responses follow `{ "error": "message" }`. All success responses follow `{ "data": { ... } }`.

### auth-service (port 8081)

#### `POST /auth/signup`
```json
// Request
{ "email": "user@example.com", "password": "secret123" }

// Response 200
{ "data": { "token": "eyJ..." } }

// Error 400
{ "error": "Email already in use" }
```

#### `POST /auth/login`
```json
// Request
{ "email": "user@example.com", "password": "secret123" }

// Response 200
{ "data": { "token": "eyJ..." } }

// Error 401
{ "error": "Invalid credentials" }
```

#### `GET /auth/verify`
```
Headers: Authorization: Bearer <token>

// Response 200
{ "data": { "userId": "uuid", "email": "user@example.com" } }

// Error 401
{ "error": "Invalid or expired token" }
```

#### `GET /auth/verify-apikey`
```
Headers: x-api-key: <raw_key>

// Response 200
{ "data": { "userId": "uuid" } }

// Error 401
{ "error": "Invalid API key" }
```

---

### agent-service (port 8082)

All routes except `/agents/public/:id` require `Authorization: Bearer <token>`.

#### `POST /agents`
```json
// Request
{
  "name": "Support Bot",
  "system_prompt": "You are a helpful customer support agent...",
  "temperature": 0.7,
  "model": "stepfun-ai/step-3.5-flash:free",
  "webhook_url": "https://example.com/webhook"
}

// Response 201
{ "data": { "agent": { "id": "uuid", "name": "Support Bot", ... } } }
```

#### `GET /agents`
```json
// Response 200
{ "data": { "agents": [ { "id": "uuid", "name": "Support Bot", ... } ] } }
```

#### `GET /agents/:id`
```json
// Response 200
{ "data": { "agent": { "id": "uuid", "name": "...", "systemPrompt": "...", ... } } }
```

#### `DELETE /agents/:id`
```
// Response 204 No Content
```

#### `GET /agents/public/:id` — No auth required
```json
// Response 200
{
  "data": {
    "id": "uuid",
    "name": "Support Bot",
    "system_prompt": "...",
    "temperature": "0.7",
    "model": "stepfun-ai/step-3.5-flash:free",
    "webhook_url": null
  }
}
```

#### `GET /agents/:id/analytics`
```json
// Response 200
{
  "data": {
    "totalConversations": 42,
    "totalMessages": 187,
    "lastActivity": "2025-01-15T10:30:00Z"
  }
}
```

#### `POST /apikeys`
```json
// Response 200
{ "data": { "key": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" } }
// ⚠ This is shown only once. Store it securely.
```

#### `GET /apikeys`
```json
// Response 200
{ "data": { "hasKey": true, "createdAt": "2025-01-10T09:00:00Z" } }
```

---

### chat-service (port 8083)

#### `POST /chat`
```json
// Request (public — no auth needed)
{
  "agentId": "uuid",
  "message": "Hello, I need help",
  "conversationId": "uuid"  // optional — omit for new conversation
}

// Request (programmatic — with API key)
// Headers: x-api-key: <your_raw_api_key>
// Body: same as above

// Response 200
{
  "data": {
    "reply": "Hi! How can I help you today?",
    "conversationId": "uuid"
  }
}
```

#### `GET /conversations/:agentId`
```
Headers: Authorization: Bearer <token>

// Response 200
{
  "data": [
    {
      "id": "uuid",
      "startedAt": "2025-01-15T10:00:00Z",
      "messageCount": 6,
      "firstMessage": "Hello, I need help with..."
    }
  ]
}
```

#### `GET /conversations/:conversationId/messages`
```
Headers: Authorization: Bearer <token>

// Response 200
{
  "data": {
    "messages": [
      { "role": "user", "content": "Hello", "createdAt": "..." },
      { "role": "assistant", "content": "Hi there!", "createdAt": "..." }
    ]
  }
}
```

---

## Embedding a Chat Widget

Every agent has a public chat page at `/chat/<agentId>`. Embed it anywhere:

```html
<iframe
  src="https://yourapp.com/chat/AGENT_ID_HERE"
  width="400"
  height="600"
  style="border: none; border-radius: 12px;"
></iframe>
```

No authentication required — the chat page is fully public.

---

## AI Tools Usage

**Tools used:**
- Claude Sonnet 4.6 — architecture planning, all code generation, debugging

**Estimated time saved:** ~20–25 hours. A full-stack microservices project with this scope would typically take 2–3 days solo. With AI assistance, the core implementation was completed in a fraction of the time.

**One example helpful prompt:**
> "Write the Hono route handler for POST /chat that: validates agentId via agent-service, optionally checks x-api-key via auth-service, creates or reuses a conversation, fires the webhook fire-and-forget on new conversations, builds the last-10-message context window with the system prompt prepended, calls OpenRouter, saves both messages, and returns { reply, conversationId } — following the { data: ... } / { error: ... } response format throughout."

**One challenge faced:**
Route ordering in Hono — `/agents/public/:id` needs to be registered *before* `/agents/:id`, otherwise the string `"public"` gets captured as the `:id` param. Fixed by rewriting the agent-service to use a flat Hono app rather than a sub-router, ensuring explicit route registration order.

---

## Tech Choices

**Hono over Express/Fastify:** Hono is edge-native, has first-class TypeScript support, and its router is extremely fast. The middleware API is clean and the request/response model is based on the standard Fetch API — making it easy to deploy to any runtime (Node, Deno, Bun, Workers) with zero changes.

**NeonDB:** Serverless Postgres that scales to zero. No connection pooling to manage, no always-on compute cost. The `@neondatabase/serverless` driver works over HTTP, which is ideal for stateless microservices. Free tier is generous for development and small production workloads.

**Drizzle ORM:** Type-safe SQL with zero "magic". Drizzle gives you full TypeScript autocomplete on queries while keeping the SQL readable. Lightweight, fast, and doesn't hide what queries it runs.

**Microservice architecture:** The three services map cleanly to the three domains (auth, agents, chat). Each can be scaled, deployed, and reasoned about independently. The chat-service — the highest-traffic service — can be scaled horizontally without touching auth or agent management. Inter-service communication via plain HTTP keeps the coupling loose.

**OpenRouter:** Single API that proxies to dozens of free LLM providers. No billing setup, no vendor lock-in. The OpenAI-compatible interface means the `openai` npm package works out of the box with just a `baseURL` swap.
