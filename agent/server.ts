import { createServer } from "node:http";
import { createRepositoryAgent } from "./graph.ts";

type ChatMessage = { role: "user" | "assistant"; content: string };
const threads = new Map<string, ChatMessage[]>();

const server = createServer(async (request, response) => {
  const origin = request.headers.origin;
  response.setHeader("Access-Control-Allow-Origin", origin ?? "http://localhost:3000");
  response.setHeader("Access-Control-Allow-Headers", "content-type");
  response.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  if (request.method === "OPTIONS") {
    response.writeHead(204).end();
    return;
  }
  if (request.method !== "POST" || request.url !== "/stream") {
    response.writeHead(404).end();
    return;
  }
  try {
    const body = JSON.parse(await readBody(request)) as { credential?: unknown; threadId?: unknown; messages?: unknown };
    if (typeof body.credential !== "string" || typeof body.threadId !== "string" || !Array.isArray(body.messages)) {
      response.writeHead(400, { "Content-Type": "application/json" }).end(JSON.stringify({ error: "credential, threadId and messages are required" }));
      return;
    }
    const incoming = body.messages.filter(isMessage);
    const messages = [...(threads.get(body.threadId) ?? []), ...incoming];
    threads.set(body.threadId, messages);
    const agent = createRepositoryAgent(body.credential);
    response.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
    response.write(`event: progress\ndata: ${JSON.stringify({ step: "codeloom-repository-agent" })}\n\n`);
    const result = await agent.invoke({ messages });
    const assistantText = findAssistantText(result);
    if (assistantText) {
      threads.set(body.threadId, [...messages, { role: "assistant", content: assistantText }]);
      response.write(`event: answer\ndata: ${JSON.stringify({ answer: assistantText })}\n\n`);
    }
    else response.write(`event: error\ndata: ${JSON.stringify({ error: "The agent returned no answer" })}\n\n`);
    response.write("event: done\ndata: {}\n\n");
    response.end();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Agent stream failed:", message);
    if (!response.headersSent) {
      response.writeHead(500, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ error: message }));
    } else {
      response.write(`event: error\ndata: ${JSON.stringify({ error: message })}\n\n`);
      response.end();
    }
  }
});

server.listen(Number(process.env.AGENT_PORT ?? 8123), "127.0.0.1", () => {
  console.log(`CodeLoom agent listening on http://127.0.0.1:${process.env.AGENT_PORT ?? 8123}`);
});

function readBody(request: import("node:http").IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk: string) => (body += chunk));
    request.on("end", () => resolve(body));
    request.on("error", reject);
  });
}

function isMessage(value: unknown): value is ChatMessage {
  return typeof value === "object" && value !== null && (Reflect.get(value, "role") === "user" || Reflect.get(value, "role") === "assistant") && typeof Reflect.get(value, "content") === "string";
}

function findAssistantText(value: unknown): string | null {
  if (Array.isArray(value)) {
    for (let index = value.length - 1; index >= 0; index--) {
      const found = findAssistantText(value[index]);
      if (found) return found;
    }
    return null;
  }
  if (typeof value !== "object" || value === null) return null;
  const messages = Reflect.get(value, "messages");
  if (Array.isArray(messages)) {
    for (let index = messages.length - 1; index >= 0; index--) {
      const message = messages[index];
      if (typeof message === "object" && message !== null && isAssistantMessage(message)) {
        const content = readContent(messageContent(message));
        if (content) return content;
      }
    }

    function isAssistantMessage(value: object): boolean {
      const kwargs = Reflect.get(value, "kwargs");
      return (
        Reflect.get(value, "type") === "ai" ||
        Reflect.get(value, "role") === "assistant" ||
        (typeof kwargs === "object" && kwargs !== null && (Reflect.get(kwargs, "type") === "ai" || Reflect.get(kwargs, "role") === "assistant"))
      );
    }

    function messageContent(value: object): unknown {
      const direct = Reflect.get(value, "content");
      if (direct !== undefined) return direct;
      const kwargs = Reflect.get(value, "kwargs");
      return typeof kwargs === "object" && kwargs !== null ? Reflect.get(kwargs, "content") : undefined;
    }

    function readContent(value: unknown): string | null {
      if (typeof value === "string" && value) return value;
      if (!Array.isArray(value)) return null;
      const text = value
        .map((block) => {
          if (typeof block === "string") return block;
          if (typeof block === "object" && block !== null && typeof Reflect.get(block, "text") === "string") return Reflect.get(block, "text");
          return "";
        })
        .filter(Boolean)
        .join("");
      return text || null;
    }
  }
  for (const child of Object.values(value)) {
    const found = findAssistantText(child);
    if (found) return found;
  }
  return null;
}
