import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: "https://openrouter.ai/api/v1",
  defaultHeaders: {
    "HTTP-Referer": "http://localhost:3000",
    "X-Title": "Verbex AI Agency",
  },
});

export async function generateReply(
  messages: { role: string; content: string }[],
  model: string,
  temperature: number
): Promise<string> {
  try {
    const res = await client.chat.completions.create({
      model,
      messages: messages as any,
      temperature,
    });
    return res.choices[0]?.message?.content?.trim() ?? "No response";
  } catch {
    try {
      const res = await client.chat.completions.create({
        model: "openai/gpt-oss-20b:free",
        messages: messages as any,
        temperature,
      });
      return res.choices[0]?.message?.content?.trim() ?? "No response";
    } catch {
      return "I'm temporarily unavailable. Please try again in a moment.";
    }
  }
}

export async function generateReplyStream(
  messages: { role: string; content: string }[],
  model: string,
  temperature: number
): Promise<ReadableStream<Uint8Array>> {
  const encoder = new TextEncoder();

  async function tryStream(modelName: string): Promise<ReadableStream<Uint8Array>> {
    const stream = await client.chat.completions.create({
      model: modelName,
      messages: messages as any,
      temperature,
      stream: true,
    });

    return new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            const delta = chunk.choices[0]?.delta?.content;
            if (delta) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ token: delta })}\n\n`));
            }
          }
          controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
          controller.close();
        } catch (err) {
          controller.error(err);
        }
      },
    });
  }

  try {
    return await tryStream(model);
  } catch {
    try {
      return await tryStream("openai/gpt-oss-20b:free");
    } catch {
      return new ReadableStream({
        start(controller) {
          const msg = "I'm temporarily unavailable. Please try again in a moment.";
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ token: msg })}\n\n`));
          controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
          controller.close();
        },
      });
    }
  }
}

export const FREE_MODELS = [
  { label: "StepFun Step 3.5 Flash — 256K ctx (Default)", value: "stepfun-ai/step-3.5-flash:free" },
  { label: "MiniMax M2.5 — 196K ctx", value: "minimax/minimax-m2.5:free" },
  { label: "NVIDIA Nemotron 3 Super — 262K ctx", value: "nvidia/nemotron-3-super:free" },
  { label: "Qwen3 Next 80B — 262K ctx", value: "qwen/qwen3-next-80b-a3b-instruct:free" },
  { label: "OpenAI gpt-oss-120b — 131K ctx", value: "openai/gpt-oss-120b:free" },
  { label: "OpenAI gpt-oss-20b — 131K ctx", value: "openai/gpt-oss-20b:free" },
  { label: "Mistral Small 3.1 24B — 128K ctx", value: "mistralai/mistral-small-3.1-24b-instruct:free" },
  { label: "Z.ai GLM 4.5 Air — 131K ctx", value: "z-ai/glm-4.5-air:free" },
  { label: "NVIDIA Nemotron Nano 30B — 256K ctx", value: "nvidia/nemotron-3-nano-30b-a3b:free" },
  { label: "Arcee Trinity Large — 131K ctx", value: "arcee-ai/trinity-large-preview:free" },
];
