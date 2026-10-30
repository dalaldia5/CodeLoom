// The one place the AI client is constructed. A client built anywhere else
// would work and silently go untraced, so nothing else imports a provider SDK.

// Exact snapshots, never a moving alias: an alias changes the model under a
// cached answer without changing its key. Each model is part of its own
// tasks' cache keys, so re-pinning one invalidates only its own answers.
export const MODELS = {
  explain: "openai/gpt-oss-120b",
  classify: "openai/gpt-oss-20b",
} as const;

export type TracingStatus = { on: true; project: string } | { on: false; reason: string };
type Message = { role: "system" | "user"; content: string };
type CompletionOptions = {
  model: string;
  messages: Message[];
  maxTokens: number;
  responseFormat?: { type: "json_object" };
};
type CompletionResponse = {
  choices: Array<{ message?: { content?: string | null } }>;
};

export function tracingStatus(): TracingStatus {
  if (process.env.LANGSMITH_TRACING?.trim() !== "true") return { on: false, reason: "LANGSMITH_TRACING isn't \"true\"" };
  if (!process.env.LANGSMITH_API_KEY?.trim()) return { on: false, reason: "LANGSMITH_API_KEY isn't set" };
  return { on: true, project: process.env.LANGSMITH_PROJECT?.trim() || "default" };
}

export async function complete(options: CompletionOptions): Promise<CompletionResponse> {
  const apiKey = process.env.GROQ_API_KEY?.trim();
  if (!apiKey) throw new Error("GROQ_API_KEY isn't set in .env.local, so nothing can be explained");

  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: options.model,
      max_tokens: options.maxTokens,
      messages: options.messages,
      ...(options.responseFormat ? { response_format: options.responseFormat } : {}),
    }),
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Groq request failed (${response.status}): ${detail}`);
  }
  const body: unknown = await response.json();
  if (!isCompletionResponse(body)) throw new Error("Groq returned an invalid completion response");
  return body;
}

function isCompletionResponse(value: unknown): value is CompletionResponse {
  return typeof value === "object" && value !== null && Array.isArray(Reflect.get(value, "choices"));
}

export function traceConfig(name: string) {
  return { name, run_type: "chain", tracingEnabled: tracingStatus().on } as const;
}
