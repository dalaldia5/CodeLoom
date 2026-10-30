"use client";

import { useClerk } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { resolveOrganization } from "./actions";

export function Activate({ repo }: { repo?: string }) {
  const { setActive } = useClerk();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  // Strict mode runs effects twice in dev; two calls could create two orgs.
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    resolveOrganization()
      .then((organization) => setActive({ organization }))
      .then(() => router.replace(repo ? `/start/submit?repo=${encodeURIComponent(repo)}` : "/dashboard"))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, [repo, setActive, router]);

  return error ? (
    <p className="text-xs text-fg">Couldn&apos;t set up an organization: {error}</p>
  ) : (
    <p className="text-xs text-fg-muted">Setting up your organization…</p>
  );
}
