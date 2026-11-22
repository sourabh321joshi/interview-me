"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import type { Dimension, Report } from "@/lib/report-schema";

type InterviewDetails = {
  role: "frontend" | "backend" | "fullstack";
  level: "fresher" | "junior";
  duration_seconds: number;
  started_at: string | null;
};

type State =
  | { kind: "loading" } | { kind: "pending" } | { kind: "error"; message: string }
  | { kind: "failed"; canRegenerate: boolean } | { kind: "ready"; report: Report; details: InterviewDetails | null };

const LABELS: Record<Dimension, string> = { problem_solving: "Problem solving", technical_depth: "Technical depth", fundamentals: "Fundamentals", communication: "Communication" };
const ROLES: Record<InterviewDetails["role"], string> = { frontend: "Frontend", backend: "Backend", fullstack: "Full-stack" };
const LEVELS: Record<InterviewDetails["level"], string> = { fresher: "Fresher", junior: "1–3 years" };

export default function ReportPage() {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [id, setId] = useState("");

  useEffect(() => {
    const interview = new URLSearchParams(window.location.search).get("interview") ?? "";
    let stop = false;
    async function poll() {
      if (!interview) return setState({ kind: "error", message: "No interview selected." });
      setId(interview);
      while (!stop) {
        try {
          const res = await fetch(`/api/v1/interviews/${interview}/report`);
          const json = await res.json();
          if (!res.ok) return setState({ kind: "error", message: json?.error?.message ?? "Could not load the report." });
          if (json.status === "ready") {
            // The report endpoint has the rubric; session details come from the interview.
            const details = await fetch(`/api/v1/interviews/${interview}`)
              .then((response) => response.ok ? response.json() : null)
              .catch(() => null);
            if (!stop) setState({ kind: "ready", report: json, details });
            return;
          }
          if (json.status === "failed") return setState({ kind: "failed", canRegenerate: !!json.can_regenerate });
          setState({ kind: "pending" });
        } catch {
          return setState({ kind: "error", message: "Network problem. Reload to try again." });
        }
        await new Promise((r) => setTimeout(r, 3000));
      }
    }
    Promise.resolve().then(poll);
    return () => { stop = true; };
  }, []);

  async function regenerate() {
    await fetch(`/api/v1/interviews/${id}/report/regenerate`, { method: "POST" });
    window.location.reload();
  }

  return (
    <main className="mx-auto max-w-5xl px-5 pb-12 sm:px-8">
      <header className="border-b border-line py-5">
        <Link href="/" className="font-semibold hover:text-indigo-300">Interview Me</Link>
      </header>
      <h1 className="mt-9 text-3xl font-semibold tracking-tight sm:mt-12 sm:text-4xl">Your interview feedback</h1>
      {state.kind === "loading" && <p className="mt-4 text-muted">Loading…</p>}
      {state.kind === "pending" && <p role="status" className="mt-4 text-muted">We are preparing your feedback. This usually takes under a minute.</p>}
      {state.kind === "error" && <p role="alert" className="mt-4 text-red-300">{state.message} <a className="underline" href={id ? `/interview?interview=${id}` : "/interview"}>Back to the interview</a></p>}
      {state.kind === "failed" && (
        <div role="alert" className="mt-4 space-y-2">
          <p className="text-red-300">We could not create your feedback.</p>
          {state.canRegenerate ? <button onClick={regenerate} className="action">Try again</button> : <p className="text-sm text-muted">There may not have been enough answers to evaluate. <a className="underline" href="/interview">Start a new interview</a></p>}
        </div>
      )}
      {state.kind === "ready" && <ReportView r={state.report} details={state.details} id={id} />}
    </main>
  );
}


function ReportView({ r, details, id }: { r: Report; details: InterviewDetails | null; id: string }) {
  const interviewDate = details?.started_at
    ? new Date(details.started_at).toLocaleDateString(undefined, { dateStyle: "medium" })
    : null;

  return (
    <div className="mt-6 space-y-9">
      <section className="surface p-5 sm:p-7" aria-label="Interview summary">
        {details && (
          <dl className="grid grid-cols-2 gap-4 border-b border-line pb-5 sm:grid-cols-4">
            <div><dt className="text-xs text-muted">Role</dt><dd className="mt-1 text-sm font-semibold">{ROLES[details.role]}</dd></div>
            <div><dt className="text-xs text-muted">Level</dt><dd className="mt-1 text-sm font-semibold">{LEVELS[details.level]}</dd></div>
            <div><dt className="text-xs text-muted">Duration</dt><dd className="mt-1 text-sm font-semibold">{details.duration_seconds / 60} minutes</dd></div>
            {interviewDate && <div><dt className="text-xs text-muted">Date</dt><dd className="mt-1 text-sm font-semibold"><time dateTime={details.started_at!}>{interviewDate}</time></dd></div>}
          </dl>
        )}
        <p className={`max-w-3xl leading-relaxed text-muted ${details ? "mt-4" : ""}`}>{r.summary}</p>
      </section>

      <section aria-labelledby="scores">
        <h2 id="scores" className="text-xl font-semibold">Scores</h2>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {(Object.keys(LABELS) as Dimension[]).map((key) => {
            const { score, rationale, evidence } = r.scores[key];
            return (
              <li key={key} className="surface p-4">
                <h3 className="text-sm font-semibold">{LABELS[key]}</h3>
                {score === null ? <p className="mt-3 text-sm font-semibold text-muted">Not enough evidence</p> : (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <span className="flex gap-1" aria-hidden="true">
                      {Array.from({ length: 5 }, (_, i) => (
                        <span key={i} className={`size-2.5 rounded-full border ${i < score ? "border-indigo-300 bg-indigo-300" : "border-muted"}`} />
                      ))}
                    </span>
                    <span className="text-sm font-semibold tabular-nums text-indigo-200">{score} / 5</span>
                  </div>
                )}
                {rationale && <p className="mt-3 text-sm leading-relaxed text-muted">{rationale}</p>}
                {evidence.length > 0 && (
                  <details className="mt-3 text-sm">
                    <summary className="cursor-pointer text-indigo-300 underline">Evidence</summary>
                    {evidence.map((item, i) => (
                      <blockquote key={i} className="mt-2 border-l-2 border-indigo-400 pl-3 break-words">
                        “{item.quote}”
                        {item.note && <span className="mt-1 block text-muted">{item.note}</span>}
                      </blockquote>
                    ))}
                  </details>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-labelledby="strengths">
        <h2 id="strengths" className="text-xl font-semibold">What went well</h2>
        <div className="surface mt-4 px-5 py-4 sm:px-7">
          <ul className="list-disc space-y-2 pl-5 text-sm leading-relaxed marker:text-indigo-300">
            {r.strengths.map((strength, i) => <li key={i}>{strength}</li>)}
          </ul>
        </div>
      </section>

      <section aria-labelledby="fixes">
        <h2 id="fixes" className="text-xl font-semibold">Top 3 things to fix</h2>
        <ol className="mt-4 space-y-3">
          {r.top_fixes.map((fix, i) => (
            <li key={i} className="surface grid grid-cols-[auto_minmax(0,1fr)] gap-3 p-4 sm:gap-5 sm:p-6">
              <span className="flex size-8 items-center justify-center rounded-lg bg-indigo-500/15 text-sm font-semibold text-indigo-200">{i + 1}</span>
              <div>
                <h3 className="font-semibold">{fix.title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-muted">{fix.why_it_matters}</p>
                <blockquote className="mt-3 break-words rounded-r-lg border-l-2 border-indigo-400 bg-background px-3 py-2.5 text-sm leading-relaxed">
                  “{fix.evidence_quote}”
                </blockquote>
                <p className="mt-3 text-sm leading-relaxed text-muted"><span className="font-semibold text-foreground">How to improve</span><br />{fix.how_to_improve}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="practice">
        <h2 id="practice" className="text-xl font-semibold">Practice next</h2>
        <ul className="surface mt-4 divide-y divide-line px-4 sm:px-6">
          {r.suggested_practice.map((exercise, i) => (
            <li key={i}>
              <label className="flex cursor-pointer items-start gap-3 py-3 text-sm leading-relaxed">
                <input type="checkbox" className="mt-0.5 size-4 shrink-0 accent-indigo-500" />
                <span>{exercise}</span>
              </label>
            </li>
          ))}
        </ul>
      </section>

      <footer className="border-t border-line pt-5">
        <p className="text-sm text-muted">A short interview can’t assess everything. Scores reflect this conversation only.</p>
        {r.limitations && <p className="mt-2 text-sm text-muted">{r.limitations}</p>}
        <div className="mt-5 flex flex-wrap items-center gap-4">
          <Link href="/interview" className="action">Practice again</Link>
          <Link href={`/interview?interview=${id}`} className="text-sm font-semibold text-indigo-300 underline">View transcript</Link>
        </div>
      </footer>
    </div>
  );
}
