import { SubmitAfterActivation } from "./submit-after-activation";

export default async function SubmitPage({ searchParams }: { searchParams: Promise<{ repo?: string }> }) {
  const repo = (await searchParams).repo;
  if (!repo) return <p className="p-6 text-xs text-fg-muted">No repository URL was provided.</p>;
  return <SubmitAfterActivation repo={repo} />;
}
