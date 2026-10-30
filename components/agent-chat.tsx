"use client";

import { useState } from "react";

type Props = { analysisId: string; selectedTarget: { kind: "file" | "folder"; path: string | null } | null; onClose: () => void };
type ChatMessage = { role: "user" | "assistant"; content: string };

export function AgentChat({ analysisId, selectedTarget, onClose }: Props) {
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [steps, setSteps] = useState<string[]>([]);
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);

  async function ask(): Promise<void> {
    const text = question.trim();
    if (!text || busy) return;
    setQuestion("");
    setMessages((current) => [...current, { role: "user", content: text }]);
    setSteps([]);
    setAnswer("");
    setBusy(true);
    try {
      const tokenResponse = await fetch("/api/agent/token", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ analysisId }) });
      const tokenBody: unknown = await tokenResponse.json();
      if (!tokenResponse.ok) throw new Error(readError(tokenBody));
      const credential = readString(tokenBody, "credential");
      const agentUrl = readString(tokenBody, "agentUrl");
      if (!credential || !agentUrl) throw new Error("Agent credentials were not returned");
      const content = selectedTarget?.path
        ? `The selected ${selectedTarget.kind} is \`${selectedTarget.path || "."}\`. Use this selection as the subject of the question.\n\n${text}`
        : text;
      const threadId = sessionStorage.getItem(`codeloom-thread:${analysisId}`) ?? crypto.randomUUID();
      sessionStorage.setItem(`codeloom-thread:${analysisId}`, threadId);
      const response = await fetch(`${agentUrl}/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credential, threadId, messages: [{ role: "user", content }] }),
      });
      if (!response.ok || !response.body) throw new Error(`Agent request failed (${response.status})`);
      await readStream(response.body, (step) => setSteps((current) => [...current, step]), setAnswer);
    } catch (error) {
      setAnswer(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="flex h-full min-h-0 flex-col">
      <header className="flex items-center border-b border-line px-3 py-2">
        <div>
          <h2 className="text-[12px] font-semibold">Ask repository</h2>
          <p className="text-[10px] text-fg-muted">{selectedTarget?.path ? `Selected ${selectedTarget.kind}: ${selectedTarget.path}` : "Facts only: files, roles, neighbours, walks and routes"}</p>
        </div>
        <button type="button" onClick={onClose} className="ml-auto text-[11px] text-fg-muted hover:text-fg">Back</button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2 text-[12px]">
        {messages.map((message, index) => <p key={`${message.role}-${index}`} className="mb-2"><strong>{message.role === "user" ? "You" : "Agent"}:</strong> {message.content}</p>)}
        {steps.map((step, index) => <p key={`${step}-${index}`} className="mb-1 font-mono text-[10px] text-fg-muted">↳ {step}</p>)}
        {answer && <p className="whitespace-pre-wrap">{answer}</p>}
        {busy && !answer && <p className="text-fg-muted">Looking up repository facts…</p>}
      </div>
      <form className="border-t border-line p-2" onSubmit={(event) => { event.preventDefault(); void ask(); }}>
        <textarea value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Where is authentication handled?" rows={3} className="w-full resize-none border border-line bg-surface px-2 py-1 text-[12px] outline-none focus:border-accent" disabled={busy} />
        <button type="submit" className="mt-1 border border-accent px-2 py-1 text-[11px] text-accent hover:bg-accent/10" disabled={busy || !question.trim()}>Ask</button>
      </form>
    </section>
  );
}

async function readStream(stream: ReadableStream<Uint8Array>, onStep: (step: string) => void, onAnswer: (answer: string) => void): Promise<void> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const chunk = await reader.read();
    if (chunk.done) break;
    buffer += decoder.decode(chunk.value, { stream: true });
    const events = buffer.split("\n\n");
    buffer = events.pop() ?? "";
    for (const event of events) {
      const eventName = event.split("\n").find((item) => item.startsWith("event: "))?.slice(7);
      const line = event.split("\n").find((item) => item.startsWith("data: "));
      if (!line) continue;
      const value: unknown = JSON.parse(line.slice(6));
      if (eventName === "answer" && readString(value, "answer")) {
        onAnswer(readString(value, "answer") ?? "");
        continue;
      }
      const text = JSON.stringify(value);
      const tool = text.match(/"name":"([^"]+)"/)?.[1];
      if (tool) onStep(tool);
      const content = findAssistantText(value);
      if (content) onAnswer(content);
      const error = readString(value, "error");
      if (error) onAnswer(error);
    }
  }
}

function findAssistantText(value: unknown): string | null {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findAssistantText(item);
      if (found) return found;
    }
    return null;
  }
  if (typeof value !== "object" || value === null) return null;
  const messages = Reflect.get(value, "messages");
  if (Array.isArray(messages)) {
    for (let i = messages.length - 1; i >= 0; i--) {
      const message = messages[i];
      if (typeof message === "object" && message !== null && isAssistantMessage(message)) {
        const content = readContent(messageContent(message));
        if (content) return content;
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
    }
  }
  for (const child of Object.values(value)) {
    const found = findAssistantText(child);
    if (found) return found;
  }
  return null;
}

function readString(value: unknown, key: string): string | null {
  if (typeof value !== "object" || value === null) return null;
  const found = Reflect.get(value, key);
  return typeof found === "string" ? found : null;
}

function readError(value: unknown): string {
  return readString(value, "error") ?? "Agent request failed";
}
