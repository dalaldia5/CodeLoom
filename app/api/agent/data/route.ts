import { NextResponse } from "next/server";
import { verifyAgentCredential } from "@/lib/agent/credential";
import { loadStoredAnalysis } from "@/lib/analysis/load";
import { neighboursOf, rankRepository } from "@/lib/graph/detail";
import { adjacency, reach, type Direction } from "@/lib/graph/reach";
import { createAdminSupabase } from "@/lib/supabase/admin";

type RequestBody = { credential?: unknown; action?: unknown; args?: unknown };

export async function POST(request: Request): Promise<Response> {
  const body = (await request.json()) as RequestBody;
  if (typeof body.credential !== "string" || typeof body.action !== "string") {
    return NextResponse.json({ error: "Credential and action are required" }, { status: 400 });
  }
  try {
    const claims = verifyAgentCredential(body.credential);
    const facts = await readFacts(claims.analysisId, claims.organizationId);
    return NextResponse.json(runAction(facts, body.action, body.args));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 401 });
  }
}

async function readFacts(analysisId: string, organizationId: string) {
  const db = createAdminSupabase();
  const { data: analysis, error } = await db
    .from("analyses")
    .select("id, coverage, detected_projects, project:projects(repo_owner, repo_name)")
    .eq("id", analysisId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (error) throw new Error(`Couldn't read analysis: ${error.message}`);
  if (!analysis?.project) throw new Error("Analysis not found");
  const stored = await loadStoredAnalysis(db, {
    id: analysis.id,
    label: `${analysis.project.repo_owner}/${analysis.project.repo_name}`,
    coverage: analysis.coverage,
    projects: analysis.detected_projects,
  });
  return stored.result;
}

function runAction(result: Awaited<ReturnType<typeof readFacts>>, action: string, rawArgs: unknown): unknown {
  const args = typeof rawArgs === "object" && rawArgs !== null ? rawArgs : {};
  const path = typeof Reflect.get(args, "path") === "string" ? Reflect.get(args, "path") : undefined;
  switch (action) {
    case "file_details": {
      if (!path) throw new Error("file_details requires path");
      const file = result.files.find((candidate) => candidate.path === path);
      if (!file) throw new Error(`File not found in parsed analysis: ${path}`);
      return {
        path: file.path,
        module: file.module,
        lines: file.lines,
        bytes: file.bytes,
        role: file.role,
        reachedBy: file.reachedBy,
        exports: file.exports,
        fanIn: file.fanIn,
        fanOut: file.fanOut,
        imports: result.edges.filter((edge) => edge.source === path).map((edge) => edge.target).slice(0, 100),
        importedBy: result.edges.filter((edge) => edge.target === path).map((edge) => edge.source).slice(0, 100),
      };
    }
    case "summary":
      return { root: result.root, projects: result.projects, files: result.files.length, edges: result.edges.length, coverage: result.coverage, rankings: rankRepository(result.files) };
    case "search_files": {
      const query = typeof Reflect.get(args, "query") === "string" ? Reflect.get(args, "query").toLowerCase() : "";
      return { files: result.files.filter((file) => file.path.toLowerCase().includes(query)).map((file) => file.path).slice(0, 100) };
    }
    case "files_by_role": {
      const role = typeof Reflect.get(args, "role") === "string" ? Reflect.get(args, "role") : "";
      return { files: result.files.filter((file) => file.role === role).map((file) => file.path).slice(0, 100) };
    }
    case "neighbours":
      if (!path) throw new Error("neighbours requires path");
      return neighboursOf(result.edges, path);
    case "walk": {
      if (!path) throw new Error("walk requires path");
      const direction = Reflect.get(args, "direction");
      if (direction !== "dependents" && direction !== "dependencies") throw new Error("walk direction must be dependents or dependencies");
      return reach(adjacency(result.edges), path, direction as Direction);
    }
    case "routes":
      return { routes: result.routes, omitted: result.coverage.routes.omitted, withheld: result.coverage.routes.withheld };
    default:
      throw new Error(`Unknown agent action: ${action}`);
  }
}
