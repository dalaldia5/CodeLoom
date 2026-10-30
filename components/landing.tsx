"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { submitAnalysis, type FormState } from "@/app/(workspace)/actions";
import { ThemeControl } from "@/components/theme-control";
import type { Theme } from "@/lib/theme";
import type { ReactNode } from "react";

const INITIAL: FormState = { error: null };

export function Landing({ initialTheme, signedIn }: { initialTheme: Theme; signedIn: boolean }) {
  const router = useRouter();
  const { orgId } = useAuth();
  const [url, setUrl] = useState("");
  const [state, action, pending] = useActionState(submitAnalysis, INITIAL);

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = url.trim();
    if (!value) return;
    if (!signedIn) {
      router.push(`/sign-in?redirect_url=${encodeURIComponent(`/start?repo=${value}`)}`);
      return;
    }
    if (!orgId) {
      router.push(`/start?repo=${encodeURIComponent(value)}`);
      return;
    }
    if (!pending) {
      const form = new FormData();
      form.set("url", value);
      void action(form);
    }
  }

  return (
    <main>
      <header className="sticky top-0 z-10 border-b border-line bg-canvas/95 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-[1140px] items-center gap-3 px-6">
          <Link href="/" className="font-mono text-sm font-semibold tracking-tight">codeloom</Link>
          <span className="text-line">/</span>
          <span className="text-xs text-fg-muted">repository maps</span>
          <div className="ml-auto flex items-center gap-3">
            <ThemeControl initial={initialTheme} />
            <Link href={signedIn ? "/dashboard" : "/sign-in"} className="text-xs text-fg-muted hover:text-fg">
              {signedIn ? "Open workspace" : "Sign in"}
            </Link>
          </div>
        </div>
      </header>

      <section className="mx-auto grid min-h-[calc(100vh-3.5rem)] w-full max-w-[1140px] items-center gap-16 px-6 py-24 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div>
          <p className="mb-5 font-mono text-xs uppercase tracking-[0.18em] text-accent">Codebase cartography</p>
          <h1 className="max-w-[12ch] text-5xl font-semibold leading-[1.05] tracking-[-0.055em] sm:text-7xl">
            See how a repository holds together.
          </h1>
          <p className="mt-7 max-w-[46ch] text-base leading-7 text-fg-muted">
            CodeLoom parses a public GitHub repository into a dependency map you can actually follow.
          </p>
          <form onSubmit={submit} className="mt-9 flex max-w-[38rem] flex-col gap-2 sm:flex-row">
            <input value={url} onChange={(event) => setUrl(event.target.value)} placeholder="github.com/owner/repo" aria-label="Public GitHub repository URL" className="h-11 min-w-0 flex-1 border border-line bg-surface px-3 font-mono text-sm outline-none placeholder:text-fg-muted focus:border-accent" />
            <button type="submit" disabled={pending} className="h-11 bg-accent px-5 text-sm font-medium text-accent-fg disabled:opacity-60">
              {pending ? "Starting…" : "Map repository"}
            </button>
          </form>
          {state.error && <p role="alert" className="mt-2 text-xs text-fg">{state.error}</p>}
        </div>
        <MapIllustration />
      </section>

      <Section title="What it does" eyebrow="01">
        <p>It turns resolved imports, entry points, roles and routes into one readable map. Every connection comes from the parser, not a guess.</p>
        <MiniIllustration />
      </Section>
      <Section title="How it works" eyebrow="02" reverse>
        <p>Paste a public repository, let the parser identify its projects, then move from the whole shape to one file and its neighbours.</p>
        <StepsIllustration />
      </Section>
      <Section title="Frameworks it understands" eyebrow="03">
        <p>Adapters recognise the conventions that make a repository legible, while files outside those conventions remain visible through their real imports.</p>
        <div className="mt-8 flex max-w-[46rem] flex-wrap gap-2 font-mono text-xs text-fg-muted">
          {["Next.js", "React", "Vite", "Express", "Nest", "Django", "FastAPI", "Rails"].map((item) => <span key={item} className="border border-line px-3 py-2">{item}</span>)}
        </div>
      </Section>
      <Section title="What it deliberately doesn’t do" eyebrow="04" last reverse>
        <p>It does not invent edges, fill skipped files, or pretend an unresolved route is known. Missing information stays visible as missing information.</p>
        <p className="mt-6 font-mono text-xs text-fg-muted">absent &gt; approximate</p>
      </Section>

      <footer className="mx-auto flex w-full max-w-[1140px] border-t border-line px-6 py-8 text-xs text-fg-muted">
        <span>CodeLoom</span><span className="ml-auto">Weaving clarity into code.</span>
      </footer>
    </main>
  );
}

function Section({ title, eyebrow, children, reverse, last }: { title: string; eyebrow: string; children: ReactNode; reverse?: boolean; last?: boolean }) {
  return (
    <section className={`mx-auto grid w-full max-w-[1140px] gap-16 border-t border-line px-6 py-32 lg:grid-cols-2 ${reverse ? "lg:[&>*:first-child]:order-2" : ""} ${last ? "pb-40" : ""}`}>
      <div><p className="font-mono text-xs text-accent">{eyebrow}</p><h2 className="mt-4 text-4xl font-semibold leading-[1.1] tracking-[-0.045em]">{title}</h2></div>
      <div className="max-w-[46ch] text-base leading-7 text-fg-muted">{children}</div>
    </section>
  );
}

function MapIllustration() {
  return <svg viewBox="0 0 560 390" role="img" aria-label="Abstract dependency map" className="h-auto w-full text-accent"><g fill="none" stroke="currentColor" strokeOpacity=".35"><path d="M92 80 265 48l210 78M92 80l80 188 214-48 89-94M265 48l-23 172 144 0 89-94M172 268l214-48" /></g><g fill="var(--surface)" stroke="currentColor" strokeWidth="2"><circle cx="92" cy="80" r="13" /><circle cx="265" cy="48" r="13" /><circle cx="475" cy="126" r="13" /><circle cx="242" cy="220" r="13" /><circle cx="386" cy="220" r="13" /><circle cx="172" cy="268" r="13" /></g><circle cx="242" cy="220" r="5" fill="currentColor" /><circle cx="386" cy="220" r="5" fill="currentColor" /></svg>;
}
function MiniIllustration() { return <svg viewBox="0 0 420 150" className="mt-10 w-full text-accent" aria-hidden="true"><path d="M25 75h120m30 0h120m30 0h45" stroke="currentColor" strokeOpacity=".35" /><g fill="var(--surface)" stroke="currentColor" strokeWidth="2"><rect x="25" y="52" width="48" height="46" /><rect x="165" y="52" width="48" height="46" /><rect x="305" y="52" width="48" height="46" /></g></svg>; }
function StepsIllustration() { return <svg viewBox="0 0 420 150" className="mt-10 w-full text-accent" aria-hidden="true"><path d="M40 108 130 42l80 52 85-65 85 48" fill="none" stroke="currentColor" strokeWidth="2" /><path d="M40 108v-32M130 42v32M210 94V56M295 29v34M380 77v-30" stroke="currentColor" strokeOpacity=".35" /></svg>; }
