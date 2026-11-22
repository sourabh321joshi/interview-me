"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Dim = { score: number | null; rationale: string; evidence: { quote: string; note: string }[] };
type Report = {
  summary: string; scores: Record<string, Dim>; strengths: string[]; suggested_practice: string[]; limitations: string;
  top_fixes: { title: string; why_it_matters: string; evidence_quote: string; how_to_improve: string }[];
};
type State =
  | { kind: "loading" } | { kind: "pending" } | { kind: "error"; message: string }
  | { kind: "failed"; canRegenerate: boolean } | { kind: "ready"; report: Report };

const LABELS: Record<string, string> = { problem_solving: "Problem solving", technical_depth: "Technical depth", fundamentals: "Fundamentals", communication: "Communication" };

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
          if (json.status === "ready") return setState({ kind: "ready", report: json });
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
    <main className="mx-auto max-w-4xl px-5 py-8 sm:py-12">
      <Link href="/" className="text-sm font-semibold text-indigo-300">Interview Me</Link>
      <h1 className="mt-5 text-3xl font-semibold tracking-tight sm:text-4xl">Your interview feedback</h1>
      {state.kind === "loading" && <p className="mt-4 text-muted">Loading…</p>}
      {state.kind === "pending" && <p role="status" className="mt-4 text-muted">We are preparing your feedback. This usually takes under a minute.</p>}
      {state.kind === "error" && <p role="alert" className="mt-4 text-red-300">{state.message} <a className="underline" href={id ? `/interview?interview=${id}` : "/interview"}>Back to the interview</a></p>}
      {state.kind === "failed" && (
        <div role="alert" className="mt-4 space-y-2">
          <p className="text-red-300">We could not create your feedback.</p>
          {state.canRegenerate ? <button onClick={regenerate} className="action">Try again</button> : <p className="text-sm text-muted">There may not have been enough answers to evaluate. <a className="underline" href="/interview">Start a new interview</a></p>}
        </div>
      )}
      {state.kind === "ready" && <ReportView r={state.report} id={id} />}
    </main>
  );
}

function ReportView({ r, id }: { r: Report; id: string }) {
  return (
    <div className="mt-4 space-y-8">
      <p className="max-w-2xl leading-relaxed text-muted">{r.summary}</p>
      <section aria-labelledby="scores">
        <h2 id="scores" className="text-lg font-semibold">Scores</h2>
        <ul className="mt-3 grid gap-3 sm:grid-cols-2">
          {Object.entries(LABELS).map(([key, label]) => {
            const d = r.scores[key];
            return (
              <li key={key} className="surface p-4 sm:p-5">
                <p className="font-medium">{label}</p>
                <p className={d.score === null ? "text-sm text-muted" : "mt-1 text-2xl font-semibold tabular-nums text-indigo-300"}>{d.score === null ? "Not enough evidence" : `${d.score} / 5`}</p>
                <p className="mt-1 text-sm text-muted">{d.rationale}</p>
                {d.evidence.length > 0 && (
                  <details className="mt-2 text-sm">
                    <summary className="cursor-pointer underline">Evidence</summary>
                    {d.evidence.map((e, i) => <blockquote key={i} className="mt-2 border-l-2 border-indigo-300 pl-3">“{e.quote}”<span className="block text-muted">{e.note}</span></blockquote>)}
                  </details>
                )}
              </li>
            );
          })}
        </ul>
      </section>
      <section aria-labelledby="well">
        <h2 id="well" className="text-lg font-semibold">What went well</h2>
        <ul className="mt-2 list-disc pl-5">{r.strengths.map((s, i) => <li key={i}>{s}</li>)}</ul>
      </section>
      <section aria-labelledby="fixes">
        <h2 id="fixes" className="text-lg font-semibold">Top 3 things to fix</h2>
        <ol className="mt-3 space-y-4">
          {r.top_fixes.map((f, i) => (
            <li key={i} className="surface p-4 sm:p-5">
              <p className="font-medium">{i + 1}. {f.title}</p>
              <p className="mt-1 text-sm">{f.why_it_matters}</p>
              <blockquote className="mt-2 border-l-2 border-indigo-400 bg-background py-2 pl-3 text-sm text-muted">“{f.evidence_quote}”</blockquote>
              <p className="mt-2 text-sm"><span className="font-medium">How to improve:</span> {f.how_to_improve}</p>
            </li>
          ))}
        </ol>
      </section>
      <section aria-labelledby="practice">
        <h2 id="practice" className="text-lg font-semibold">Practice next</h2>
        <ul className="mt-2 list-disc pl-5">{r.suggested_practice.map((s, i) => <li key={i}>{s}</li>)}</ul>
      </section>
      <p className="text-sm text-muted">{r.limitations}</p>
      <div className="flex flex-wrap items-center gap-4">
        <a href="/interview" className="action">Practice again</a>
        <a href={`/interview?interview=${id}`} className="text-sm font-semibold text-indigo-300 underline">View transcript</a>
      </div>
    </div>
  );
}
