import { Client } from "langsmith";
import type { Run } from "langsmith/schemas";
import { score } from "./common.ts";

const client = new Client();
const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
const runs: Run[] = [];

for await (const project of client.listProjects()) {
  for await (const run of client.listRuns({
    projectId: project.id,
    filter: 'eq(name, "explain-file")',
    runType: "chain",
    startTime: since,
    error: false,
    limit: 100,
  })) {
    if (run.outputs) runs.push(run);
  }
}

if (runs.length === 0) {
  throw new Error("No recent explain-file traces were found for the invented-path evaluation");
}

let passed = 0;
for (const run of runs) {
  const input = run.inputs as { path?: unknown; imports?: unknown; importedBy?: unknown };
  const allowed = new Set<string>();
  addNeighbourPaths(allowed, input.path);
  addNeighbourPaths(allowed, input.imports);
  addNeighbourPaths(allowed, input.importedBy);

  const output = run.outputs as { body?: unknown } | undefined;
  const answer = typeof output?.body === "string" ? output.body : "";
  const mentioned = pathTokens(answer);
  const invalid = mentioned.filter((path) => !allowed.has(path));
  const result = score(
    "grounded_paths",
    invalid.length === 0,
    invalid.length ? `Unverified paths: ${invalid.join(", ")}` : "All cited paths are parser-verified.",
  );
  if (result.score === 1) passed++;
  await client.createFeedback({
    runId: run.id,
    sessionId: run.session_id ?? "",
    key: result.key,
    score: result.score,
    value: result.value,
    comment: result.comment,
    feedbackSourceType: "api",
  });
}

console.log(`Invented-path score: ${passed}/${runs.length} (${((passed / runs.length) * 100).toFixed(1)}%)`);
const syntheticInvalid = pathTokens("The file imports `src/made-up.ts`").filter((path) => path !== "src/entry.ts");
if (syntheticInvalid.length === 0) throw new Error("The invented-path evaluator failed its synthetic made-up filename check");
console.log(`Synthetic invented-path check: caught ${syntheticInvalid.join(", ")}`);
console.log("Evaluated recent real explain-file traces in LangSmith.");

function pathTokens(answer: string): string[] {
  const shaped = answer.match(/\b(?:[\w.-]+\/)+[\w.-]+(?:\.[\w.-]+)?\b/g) ?? [];
  return [...new Set(shaped)];
}

function addNeighbourPaths(target: Set<string>, value: unknown): void {
  if (typeof value === "string") {
    target.add(value);
    return;
  }
  if (!Array.isArray(value)) return;
  for (const item of value) {
    if (typeof item === "object" && item !== null && typeof Reflect.get(item, "path") === "string") {
      target.add(Reflect.get(item, "path"));
    }
  }
}
