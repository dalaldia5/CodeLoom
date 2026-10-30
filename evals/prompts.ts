import { evaluate } from "langsmith/evaluation";
import type { EvaluationResult } from "langsmith/evaluation";
import { complete } from "../lib/ai/client.ts";
import { explainFileMessage, type FileInput } from "../lib/ai/prompts.ts";
import { MODELS } from "../lib/ai/client.ts";
import { explanationExamples, createEvaluationDataset, runExplanation } from "./common.ts";

const RETIRED_EXPLAIN_FILE_SYSTEM = `Explain the file to a developer. Use the source and its imports and importers. Keep the answer concise and mention relevant paths.`;

type PromptInput = FileInput & { source: string };
type Answer = { answer: string };

const { client, id } = await createEvaluationDataset("prompt-versions", explanationExamples);
const current = await evaluate(runExplanation, {
  data: id,
  client,
  evaluators: [judge],
  experimentPrefix: "codeloom-prompt-current",
  description: "Current explanation prompt evaluated by a model judge",
  maxConcurrency: 1,
});
const retired = await evaluate(runRetired, {
  data: id,
  client,
  evaluators: [judge],
  experimentPrefix: "codeloom-prompt-retired",
  description: "Retired explanation prompt evaluated by a model judge",
  maxConcurrency: 1,
});

console.log("Current prompt experiment:", current);
console.log("Retired prompt experiment:", retired);
console.log("The prompt-quality score is model-judged; compare both experiments in the shared LangSmith dataset.");

async function runRetired(input: PromptInput): Promise<Answer> {
  const { source, ...question } = input;
  const response = await complete({
    model: MODELS.explain,
    maxTokens: 2048,
    messages: [
      { role: "system", content: RETIRED_EXPLAIN_FILE_SYSTEM },
      { role: "user", content: explainFileMessage(question, source) },
    ],
  });
  const answer = response.choices[0]?.message?.content;
  if (!answer) throw new Error("Retired prompt returned no answer");
  return { answer };
}

async function judge(args: {
  outputs: Record<string, unknown>;
  inputs: Record<string, unknown>;
}): Promise<EvaluationResult> {
  const answer = typeof args.outputs.answer === "string" ? args.outputs.answer : "";
  const path = typeof args.inputs.path === "string" ? args.inputs.path : "the file";
  const response = await complete({
    model: MODELS.explain,
    maxTokens: 256,
    messages: [
      {
        role: "system",
        content: "Return only JSON with a numeric score from 0 to 1 and a short reason. Judge whether an explanation is specific and useful for understanding the named file, grounded in the supplied repository facts, and concise.",
      },
      {
        role: "user",
        content: JSON.stringify({ file: path, answer }),
      },
    ],
    responseFormat: { type: "json_object" },
  });
  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error("Prompt judge returned no answer");
  const parsed: unknown = JSON.parse(content);
  if (typeof parsed !== "object" || parsed === null) throw new Error("Prompt judge returned invalid JSON");
  const rawScore = Reflect.get(parsed, "score");
  const reason = Reflect.get(parsed, "reason");
  if (typeof rawScore !== "number" || typeof reason !== "string") throw new Error("Prompt judge returned an invalid score");
  const score = Math.max(0, Math.min(1, rawScore));
  return { key: "prompt_quality", score, value: score, comment: reason };
}
