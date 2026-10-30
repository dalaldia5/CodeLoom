import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { Activate } from "./activate";

export default async function StartPage({ searchParams }: { searchParams: Promise<{ repo?: string }> }) {
  const { orgId } = await auth();
  const repo = (await searchParams).repo;
  if (orgId) redirect(repo ? `/start/submit?repo=${encodeURIComponent(repo)}` : "/dashboard");

  return (
    <div className="flex flex-1 items-center justify-center">
      <Activate repo={repo} />
    </div>
  );
}
