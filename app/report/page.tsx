"use client";

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
    <main className="mx-auto max-w-2xl p-6">
      <h1 className="text-2xl font-semibold">Your interview feedback</h1>
      {state.kind === "loading" && <p className="mt-4 text-gray-600">Loading…</p>}
      {state.kind === "pending" && <p role="status" className="mt-4 text-gray-600">We are preparing your feedback. This usually takes under a minute.</p>}
      {state.kind === "error" && <p role="alert" className="mt-4 text-red-700">{state.message} <a className="underline" href={id ? `/interview?interview=${id}` : "/interview"}>Back to the interview</a></p>}
      {state.kind === "failed" && (
        <div role="alert" className="mt-4 space-y-2">
          <p className="text-red-700">We could not create your feedback.</p>
          {state.canRegenerate ? <button onClick={regenerate} className="rounded bg-indigo-600 px-4 py-2 text-white">Try again</button> : <p className="text-sm text-gray-600">There may not have been enough answers to evaluate. <a className="underline" href="/interview">Start a new interview</a></p>}
        </div>
      )}
      {state.kind === "ready" && <ReportView r={state.report} />}
    </main>
  );
}

function ReportView({ r }: { r: Report }) {
  return (
    <div className="mt-4 space-y-8">
      <p>{r.summary}</p>
      <section aria-labelledby="scores">
        <h2 id="scores" className="text-lg font-semibold">Scores</h2>
        <ul className="mt-3 grid gap-3 sm:grid-cols-2">
          {Object.entries(LABELS).map(([key, label]) => {
            const d = r.scores[key];
            return (
              <li key={key} className="rounded border border-gray-200 p-3">
                <p className="font-medium">{label}</p>
                <p className={d.score === null ? "text-sm text-gray-500" : "text-xl"}>{d.score === null ? "Not enough evidence" : `${d.score} / 5`}</p>
                <p className="mt-1 text-sm text-gray-700">{d.rationale}</p>
                {d.evidence.length > 0 && (
                  <details className="mt-2 text-sm">
                    <summary className="cursor-pointer underline">Evidence</summary>
                    {d.evidence.map((e, i) => <blockquote key={i} className="mt-2 border-l-2 border-indigo-300 pl-3">“{e.quote}”<span className="block text-gray-600">{e.note}</span></blockquote>)}
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
            <li key={i} className="rounded border border-gray-200 p-3">
              <p className="font-medium">{i + 1}. {f.title}</p>
              <p className="mt-1 text-sm">{f.why_it_matters}</p>
              <blockquote className="mt-2 border-l-2 border-indigo-300 pl-3 text-sm">“{f.evidence_quote}”</blockquote>
              <p className="mt-2 text-sm"><span className="font-medium">How to improve:</span> {f.how_to_improve}</p>
            </li>
          ))}
        </ol>
      </section>
      <section aria-labelledby="practice">
        <h2 id="practice" className="text-lg font-semibold">Practice next</h2>
        <ul className="mt-2 list-disc pl-5">{r.suggested_practice.map((s, i) => <li key={i}>{s}</li>)}</ul>
      </section>
      <p className="text-sm text-gray-600">{r.limitations}</p>
      <a href="/interview" className="inline-block rounded bg-indigo-600 px-4 py-2 text-white">Practice again</a>
    </div>
  );
}
