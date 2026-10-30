import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { mintAgentCredential } from "@/lib/agent/credential";
import { createServerSupabase } from "@/lib/supabase/server";

export async function POST(request: Request): Promise<Response> {
  const { orgId } = await auth();
  if (!orgId) return NextResponse.json({ error: "No active organization" }, { status: 401 });
  const body: unknown = await request.json();
  const analysisId = typeof body === "object" && body !== null ? Reflect.get(body, "analysisId") : undefined;
  if (typeof analysisId !== "string" || !analysisId) return NextResponse.json({ error: "Analysis id is required" }, { status: 400 });

  const db = await createServerSupabase();
  const { data, error } = await db.from("analyses").select("id").eq("id", analysisId).eq("organization_id", orgId).maybeSingle();
  if (error) throw new Error(`Couldn't verify analysis: ${error.message}`);
  if (!data) return NextResponse.json({ error: "Analysis not found" }, { status: 404 });

  return NextResponse.json({
    credential: mintAgentCredential(analysisId, orgId),
    agentUrl: process.env.AGENT_URL?.trim() || "http://localhost:8123",
  });
}
