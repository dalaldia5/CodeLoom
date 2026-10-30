import { MODEL_ROLES } from "../lib/roles.ts";
import { loadFileInput } from "../lib/analysis/context.ts";
import { createAdminSupabase } from "../lib/supabase/admin.ts";
import { runExperiment, runRole, score, type EvalExample } from "./common.ts";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { parseRepository } from "../lib/parser/index.ts";

type RoleExample = {
  path: string;
  hash: string;
  exports: string[];
  imports: { path: string; role: string | null }[];
  importedBy: { path: string; role: string | null }[];
  source: string;
};

const db = createAdminSupabase();
const { data, error } = await db
  .from("files")
  .select("path, analysis_id, file_roles!inner(role, source), analyses!inner(commit_sha, projects!inner(repo_owner, repo_name))")
  .is("skip_reason", null)
  .eq("file_roles.source", "convention")
  .in("file_roles.role", [...MODEL_ROLES])
  .not("analyses.commit_sha", "is", null)
  .limit(1000);
if (error) throw new Error(`Couldn't load role ground truth: ${error.message}`);

const examples: EvalExample<RoleExample>[] = [];
for (const row of data) {
  if (examples.length >= 30) break;
  const role = row.file_roles[0]?.role;
  const analysis = row.analyses;
  const project = analysis?.projects;
  const sha = analysis?.commit_sha;
  if (!role || !sha || !project) continue;

  const loaded = await loadFileInput(db, row.analysis_id, row.path);
  if (!loaded) continue;
  const sourceUrl = `https://raw.githubusercontent.com/${project.repo_owner}/${project.repo_name}/${sha}/${row.path}`;
  const sourceResponse = await fetch(sourceUrl);
  if (!sourceResponse.ok) continue;
  const source = await sourceResponse.text();
  examples.push({ inputs: { ...loaded.classify, source }, outputs: { role } });
}

for (const filePath of ["lib/ai/prompts.ts", "lib/roles.ts", "evals/paths.ts"]) {
  if (examples.some((example) => example.inputs.path === filePath)) continue;
  const source = await readFile(path.resolve(filePath), "utf8");
  const parsed = parseRepository(".");
  const file = parsed.files.find((candidate) => candidate.path === filePath);
  if (!file) throw new Error(`Couldn't parse ${filePath} for the role evaluation`);
  const classify = {
    path: file.path,
    hash: file.hash,
    exports: file.exports,
    imports: parsed.edges
      .filter((edge) => edge.source === file.path)
      .map((edge) => ({ path: edge.target, role: parsed.files.find((candidate) => candidate.path === edge.target)?.role ?? null })),
    importedBy: parsed.edges
      .filter((edge) => edge.target === file.path)
      .map((edge) => ({ path: edge.source, role: parsed.files.find((candidate) => candidate.path === edge.source)?.role ?? null })),
  };
  examples.push({ inputs: { ...classify, source }, outputs: { role: "util" } });
}

if (examples.length < 30) {
  throw new Error(`Role evaluation found ${examples.length} held-out files; at least 30 are required`);
}

await runExperiment(
  "roles",
  runRole,
  examples,
  [
    (run, example) => {
      const actual = run.outputs?.role;
      const expected = example.outputs?.role;
      return score("role_accuracy", actual === expected, `Expected ${expected}; received ${String(actual)}.`);
    },
  ],
);
