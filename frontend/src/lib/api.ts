const AUTH_URL =
  process.env.NEXT_PUBLIC_AUTH_URL ?? "http://localhost:8081";
const AGENT_URL =
  process.env.NEXT_PUBLIC_AGENT_URL ?? "http://localhost:8082";
const CHAT_URL =
  process.env.NEXT_PUBLIC_CHAT_URL ?? "http://localhost:8083";

function getToken() {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("token");
}

function authHeaders() {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function handleResponse(res: Response) {
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? "Request failed");
  return json.data;
}

// Auth
export async function signup(email: string, password: string) {
  const res = await fetch(`${AUTH_URL}/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  return handleResponse(res);
}

export async function login(email: string, password: string) {
  const res = await fetch(`${AUTH_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  return handleResponse(res);
}

// Agents
export async function listAgents() {
  const res = await fetch(`${AGENT_URL}/agents`, {
    headers: { ...authHeaders() } as any,
  });
  return handleResponse(res);
}

export async function createAgent(data: {
  name: string;
  system_prompt: string;
  temperature: number;
  model: string;
  webhook_url?: string;
}) {
  const res = await fetch(`${AGENT_URL}/agents`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(authHeaders() as any),
    },
    body: JSON.stringify(data),
  });
  return handleResponse(res);
}

export async function deleteAgent(id: string) {
  const res = await fetch(`${AGENT_URL}/agents/${id}`, {
    method: "DELETE",
    headers: { ...authHeaders() } as any,
  });
  if (res.status === 204) return;
  return handleResponse(res);
}

export async function getAgent(id: string) {
  const res = await fetch(`${AGENT_URL}/agents/${id}`, {
    headers: { ...authHeaders() } as any,
  });
  return handleResponse(res);
}

export async function getAgentAnalytics(id: string) {
  const res = await fetch(`${AGENT_URL}/agents/${id}/analytics`, {
    headers: { ...authHeaders() } as any,
  });
  return handleResponse(res);
}

// API Keys
export async function generateApiKey() {
  const res = await fetch(`${AGENT_URL}/apikeys`, {
    method: "POST",
    headers: { ...authHeaders() } as any,
  });
  return handleResponse(res);
}

export async function getApiKeyStatus() {
  const res = await fetch(`${AGENT_URL}/apikeys`, {
    headers: { ...authHeaders() } as any,
  });
  return handleResponse(res);
}

// Chat
export async function sendMessage(
  agentId: string,
  message: string,
  conversationId?: string
) {
  const res = await fetch(`${CHAT_URL}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ agentId, message, conversationId }),
  });
  return handleResponse(res);
}

// Conversations
export async function getConversations(agentId: string) {
  const res = await fetch(`${CHAT_URL}/conversations/${agentId}`, {
    headers: { ...authHeaders() } as any,
  });
  return handleResponse(res);
}

export async function getConversationMessages(conversationId: string) {
  const res = await fetch(
    `${CHAT_URL}/conversations/${conversationId}/messages`,
    {
      headers: { ...authHeaders() } as any,
    }
  );
  return handleResponse(res);
}

// Update agent
export async function updateAgent(
  id: string,
  data: {
    name?: string;
    system_prompt?: string;
    temperature?: number;
    model?: string;
    webhook_url?: string;
  }
) {
  const res = await fetch(`${AGENT_URL}/agents/${id}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      ...(authHeaders() as any),
    },
    body: JSON.stringify(data),
  });
  return handleResponse(res);
}

// Streaming chat

export async function sendMessageStream(
  agentId: string,
  message: string,
  conversationId: string | undefined,
  onToken: (token: string) => void,
  onDone: (conversationId: string, followUps: string[]) => void,
  onError: (err: string) => void
) {
  const res = await fetch(`${CHAT_URL}/chat/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ agentId, message, conversationId }),
  });

  if (!res.ok) { onError("Failed to connect to chat service"); return; }

  const reader = res.body?.getReader();
  if (!reader) { onError("No response body"); return; }

  const decoder = new TextDecoder();
  let buffer = "";
  let convId = conversationId ?? "";
  let followUps: string[] = [];

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const raw = line.slice(6).trim();
      if (raw === "[DONE]") { onDone(convId, followUps); return; }
      try {
        const parsed = JSON.parse(raw);
        if (parsed.conversationId) { convId = parsed.conversationId; continue; }
        if (parsed.followUps) { followUps = parsed.followUps; continue; }
        if (parsed.token) onToken(parsed.token);
      } catch {}
    }
  }
  onDone(convId, followUps);
}
