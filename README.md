# Verbex AI Agency

A multi-service SaaS platform for creating, managing, and deploying AI chatbot agents. Users sign up, configure agents with custom system prompts and models, and embed them on any website via an iframe.

---

## Architecture

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

The platform is split into three independent Hono services:

- **auth-service** — user registration, login, JWT issuance, and API key verification
- **agent-service** — agent CRUD, API key management, and analytics aggregation
- **chat-service** — conversation handling, message history, LLM calls via OpenRouter, and webhook dispatch

Inter-service communication runs over plain HTTP. Each service owns its domain and its database tables exclusively.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Node.js + Hono (TypeScript) |
| Database | NeonDB (serverless Postgres) via Drizzle ORM |
| Frontend | Next.js 15 (TypeScript) |
| LLM | OpenRouter API (free models) |
| Package Manager | pnpm |
| Containerization | Docker + Docker Compose |

---

## Prerequisites

- Node.js 20 or later
- pnpm (`npm install -g pnpm`)
- Docker and Docker Compose
- A [NeonDB](https://neon.tech) account (free tier is sufficient)
- An [OpenRouter](https://openrouter.ai) account (free, no credit card required for free models)

---

## Setup

### 1. Clone and configure

```bash
git clone https://github.com/your-username/verbex-ai-agency.git
cd verbex-ai-agency
cp .env.example .env
```

Open `.env` and fill in the following values:

```env
DATABASE_URL=postgresql://...          # Neon connection string
JWT_SECRET=your-random-secret          # Any long random string
OPENROUTER_API_KEY=sk-or-...           # From openrouter.ai/keys

AUTH_SERVICE_URL=http://auth-service:8081
AGENT_SERVICE_URL=http://agent-service:8082
CHAT_SERVICE_URL=http://chat-service:8083

NEXT_PUBLIC_AUTH_URL=http://localhost:8081
NEXT_PUBLIC_AGENT_URL=http://localhost:8082
NEXT_PUBLIC_CHAT_URL=http://localhost:8083
```

### 2. Initialize the database

Run the migration once against your NeonDB instance. The easiest method is to open the Neon dashboard, navigate to the SQL Editor, and paste the contents of `migrate.sql`. Alternatively:

```bash
psql "$DATABASE_URL" -f migrate.sql
```

### 3. Start with Docker (recommended)

```bash
docker-compose up --build
```

All four services start automatically. The application is available at `http://localhost:3000`.

### 4. Start manually (development)

Run each service in a separate terminal:

```bash
# Terminal 1
cd services/auth-service && pnpm install && pnpm dev

# Terminal 2
cd services/agent-service && pnpm install && pnpm dev

# Terminal 3
cd services/chat-service && pnpm install && pnpm dev

# Terminal 4
cd frontend && pnpm install && pnpm dev
```

When running manually, all four processes must be running before using the frontend. Inter-service URLs default to `localhost` in this mode.

---

## API Reference

All responses follow a consistent envelope:

```json
{ "data": { ... } }        // success
{ "error": "message" }     // failure
```

### auth-service — port 8081

#### POST /auth/signup
```json
// Request
{ "email": "user@example.com", "password": "secret123" }

// Response 200
{ "data": { "token": "eyJ..." } }
```

#### POST /auth/login
```json
// Request
{ "email": "user@example.com", "password": "secret123" }

// Response 200
{ "data": { "token": "eyJ..." } }
```

#### GET /auth/verify
```
Authorization: Bearer <token>

// Response 200
{ "data": { "userId": "uuid", "email": "user@example.com" } }
```

#### GET /auth/verify-apikey
```
x-api-key: <raw_key>

// Response 200
{ "data": { "userId": "uuid" } }
```

---

### agent-service — port 8082

All routes require `Authorization: Bearer <token>` except `GET /agents/public/:id`.

#### POST /agents
```json
{
  "name": "Support Bot",
  "system_prompt": "You are a helpful support agent...",
  "temperature": 0.7,
  "model": "stepfun-ai/step-3.5-flash:free",
  "webhook_url": "https://example.com/webhook"
}
// Response 201: { "data": { "agent": { ... } } }
```

#### GET /agents
```json
// Response 200: { "data": { "agents": [ ... ] } }
```

#### GET /agents/:id
```json
// Response 200: { "data": { "agent": { ... } } }
```

#### PATCH /agents/:id
```json
// Partial update — send only the fields to change
{ "name": "New Name", "temperature": 0.5 }
// Response 200: { "data": { "agent": { ... } } }
```

#### DELETE /agents/:id
```
// Response 204 No Content
```

#### GET /agents/public/:id
Public — no authentication required. Used by the embedded chat widget.
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

#### GET /agents/:id/analytics
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

#### POST /apikeys
Generates a new API key. If one already exists, it is revoked and replaced. The raw key is returned exactly once — it cannot be retrieved again.
```json
// Response 200
{ "data": { "key": "xxxxxxxx-xxxx-..." } }
```

#### GET /apikeys
```json
// Response 200
{ "data": { "hasKey": true, "createdAt": "2025-01-10T09:00:00Z" } }
```

---

### chat-service — port 8083

#### POST /chat
Accepts both public requests and programmatic requests authenticated with an API key.
```json
// Request
{
  "agentId": "uuid",
  "message": "Hello, I need help",
  "conversationId": "uuid"
}

// Programmatic: add header x-api-key: <raw_key>

// Response 200
{
  "data": {
    "reply": "Hi, how can I help?",
    "followUps": ["Explore topic A", "See an example", "Explain in detail"],
    "conversationId": "uuid"
  }
}
```

#### POST /chat/stream
Same request body as `POST /chat`. Returns a Server-Sent Events stream. Events:

```
data: {"conversationId": "uuid"}
data: {"token": "Hi"}
data: {"token": ", how"}
data: {"followUps": ["...", "...", "..."]}
data: [DONE]
```

#### GET /conversations/:agentId
```
Authorization: Bearer <token>

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

#### GET /conversations/:conversationId/messages
```
Authorization: Bearer <token>

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

Every agent has a public chat page at `/chat/<agentId>`. Embed it on any website:

```html
<iframe
  src="https://your-domain.com/chat/AGENT_ID_HERE"
  width="400"
  height="600"
  style="border: none; border-radius: 12px;"
></iframe>
```

No authentication is required. The chat page is fully public.

---

## Environment Variables

| Variable | Description |
|---|---|
| `DATABASE_URL` | NeonDB PostgreSQL connection string |
| `JWT_SECRET` | Secret used to sign and verify JWTs |
| `OPENROUTER_API_KEY` | API key from openrouter.ai |
| `AUTH_SERVICE_URL` | Internal URL for auth-service |
| `AGENT_SERVICE_URL` | Internal URL for agent-service |
| `CHAT_SERVICE_URL` | Internal URL for chat-service |
| `NEXT_PUBLIC_AUTH_URL` | Browser-facing URL for auth-service |
| `NEXT_PUBLIC_AGENT_URL` | Browser-facing URL for agent-service |
| `NEXT_PUBLIC_CHAT_URL` | Browser-facing URL for chat-service |

The `NEXT_PUBLIC_*` variables are exposed to the browser. All others remain server-side only.

---

## Design Decisions

**Hono over Express:** Hono is built on the standard Fetch API, has first-class TypeScript support, and runs on any JavaScript runtime without modification. Its router is explicit and predictable — route registration order is transparent, which matters when distinguishing `/agents/public/:id` from `/agents/:id`.

**NeonDB:** Serverless Postgres that scales to zero between requests. The HTTP-based driver works well for stateless microservices without requiring persistent connection pools. The free tier covers development and moderate production traffic.

**Drizzle ORM:** Provides full TypeScript inference over queries while keeping the SQL close to the surface. There is no hidden query generation — what you write is what executes.

**Microservice separation:** The three services map to three distinct domains with different scaling characteristics. The chat-service handles the highest traffic and can be scaled independently. Each service can be deployed, restarted, and reasoned about without touching the others.

**OpenRouter:** A single API that routes to dozens of LLM providers. Free models require no billing setup. The OpenAI-compatible interface means the standard `openai` SDK works with only a `baseURL` change.

---

## License

MIT