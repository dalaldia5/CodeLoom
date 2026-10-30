"use client";

import { useActionState, useEffect, useRef } from "react";
import { submitAnalysis, type FormState } from "@/app/(workspace)/actions";

export function SubmitAfterActivation({ repo }: { repo: string }) {
  const [state, action] = useActionState(submitAnalysis, { error: null } satisfies FormState);
  const form = useRef<HTMLFormElement>(null);

  useEffect(() => {
    form.current?.requestSubmit();
  }, []);

  return (
    <div className="flex flex-1 items-center justify-center">
      <form ref={form} action={action} className="text-xs text-fg-muted">
        <input type="hidden" name="url" value={repo} />
        {state.error ?? "Starting your analysis…"}
      </form>
    </div>
  );
}
