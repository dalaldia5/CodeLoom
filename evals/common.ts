import { evaluate } from "langsmith/evaluation";
import type { EvaluationResult } from "langsmith/evaluation";
import { Client } from "langsmith";
import type { FileInput, ClassifyInput } from "../lib/ai/prompts.ts";
import { explainFile, classifyFile, type Explanation } from "../lib/ai/tasks.ts";

type ExplanationInput = FileInput & { source: string };
type RoleInput = ClassifyInput & { source: string };

export type EvalExample<T> = {
  inputs: T;
  outputs: Record<string, string>;
};

const cache = {
  read: async (): Promise<string | null> => null,
  write: async (): Promise<void> => undefined,
};

export const explanationExamples: EvalExample<ExplanationInput>[] = [
  {
    inputs: {
      path: "src/entry.ts",
      hash: "fixture-entry",
      role: "page-route",
      reachedBy: null,
      exports: ["render"],
      imports: [{ path: "src/lib/format.ts", role: "util", exports: ["format"], kinds: ["import"], typeOnly: false }],
      importedBy: [],
      source: 'import { format } from "./lib/format"; export function render() { return format("ok"); }',
    },
    outputs: { allowedPaths: "src/entry.ts,src/lib/format.ts" },
  },
  {
    inputs: {
      path: "src/services/users.ts",
      hash: "fixture-users",
      role: "service",
      reachedBy: null,
      exports: ["loadUsers"],
      imports: [{ path: "src/repositories/users.ts", role: "repository", exports: ["findUsers"], kinds: ["import"], typeOnly: false }],
      importedBy: [{ path: "src/routes/users.ts", role: "api-endpoint", exports: [], kinds: ["import"], typeOnly: false }],
      source: 'import { findUsers } from "../repositories/users"; export async function loadUsers() { return findUsers(); }',
    },
    outputs: { allowedPaths: "src/services/users.ts,src/repositories/users.ts,src/routes/users.ts" },
  },
];

export const roleExamples: EvalExample<RoleInput>[] = [
  {
    inputs: {
      path: "src/lib/date.ts",
      hash: "fixture-date",
      exports: ["formatDate"],
      imports: [],
      importedBy: [{ path: "src/page.tsx", role: "page-route" }],
      source: "export function formatDate(value: Date) { return value.toISOString(); }",
    },
    outputs: { role: "util" },
  },
  {
    inputs: {
      path: "src/data/users.ts",
      hash: "fixture-repository",
      exports: ["findUser"],
      imports: [],
      importedBy: [{ path: "src/services/users.ts", role: "service" }],
      source: "export async function findUser(id: string) { return db.users.find(id); }",
    },
    outputs: { role: "repository" },
  },
];

export async function runExplanation(input: ExplanationInput): Promise<{ answer: string; model: string }> {
  const { source, ...question } = input;
  const result: Explanation = await explainFile(question, { cache, source: async () => source });
  return { answer: result.body, model: result.model };
}

export async function runRole(input: RoleInput): Promise<{ role: string | null }> {
  const { source, ...question } = input;
  const result = await classifyFile(question, { cache, source: async () => source });
  return { role: result.role };
}

export function score(key: string, value: boolean, comment: string): EvaluationResult {
  return { key, score: value ? 1 : 0, value: value ? "pass" : "fail", comment };
}

export async function createEvaluationDataset<T>(name: string, examples: EvalExample<T>[]): Promise<{ client: Client; id: string }> {
  const client = new Client();
  const dataset = await client.createDataset(`codeloom-${name}-${Date.now()}`, {
    description: `CodeLoom ${name} evaluation fixtures`,
  });
  await client.createExamples({
    inputs: examples.map((example) => example.inputs as Record<string, unknown>),
    outputs: examples.map((example) => example.outputs),
    datasetId: dataset.id,
  });
  return { client, id: dataset.id };
}

export function allMentionedPaths(answer: string): string[] {
  return [...answer.matchAll(/`([^`]+)`/g)].map((match) => match[1]).filter((path): path is string => path !== undefined);
}

export async function runExperiment<T>(
  name: string,
  target: (input: T) => Promise<Record<string, unknown>>,
  examples: EvalExample<T>[],
  evaluators: Array<(run: { outputs?: Record<string, unknown> }, example: { outputs?: Record<string, unknown> }) => EvaluationResult>,
): Promise<void> {
  const { client, id } = await createEvaluationDataset(name, examples);
  const result = await evaluate(target, {
    data: id,
    client,
    evaluators: evaluators.map((evaluator) => (args: { run: { outputs?: Record<string, unknown> }; example: { outputs?: Record<string, unknown> } }) =>
      evaluator(args.run, args.example),
    ),
    experimentPrefix: `codeloom-${name}`,
    description: `CodeLoom ${name} evaluation`,
    maxConcurrency: 1,
  });
  console.log(`LangSmith experiment started: ${name}`);
  console.log(result);
}
