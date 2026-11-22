import { Fragment } from "react";
import type { Report } from "@/lib/report-schema";
import { highlightQuotes, reportQuotes } from "./transcript-evidence";

export type TranscriptTurn = {
  seq: number;
  speaker: "interviewer" | "candidate";
  kind: string;
  text: string;
  t_offset_ms: number;
};

function timestamp(milliseconds: number) {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export default function TranscriptView({ report, startedAt, turns }: {
  report: Report;
  startedAt: string | null;
  turns: TranscriptTurn[] | null;
}) {
  const quotes = reportQuotes(report);
  return (
    <main id="transcript" tabIndex={-1} className="mx-auto max-w-5xl px-5 pb-12 sm:px-8">
      <header className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-4 border-b border-line bg-background py-5">
        <div>
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Interview transcript</h1>
          {startedAt && <time dateTime={startedAt} className="mt-1 block text-sm text-muted">
            {new Date(startedAt).toLocaleDateString(undefined, { dateStyle: "medium" })}
          </time>}
        </div>
        <a href="#report" className="text-sm font-semibold text-indigo-300 underline">Back to report</a>
      </header>

      {turns === null ? <p role="alert" className="mt-6 text-sm text-red-300">Could not load the transcript.</p>
        : turns.length === 0 ? <p className="mt-6 text-sm text-muted">This interview has no transcript.</p>
        : (
          <ol aria-label="Interview transcript" className="surface mt-6 space-y-5 p-4 sm:p-6">
            {turns.map((turn) => {
              const candidate = turn.speaker === "candidate";
              const segments = highlightQuotes(turn.text, candidate && turn.kind !== "system" ? quotes : []);
              const cited = segments.some((part) => part.highlighted);
              return (
                <li key={turn.seq} className={candidate ? "flex justify-end" : ""}>
                  <div className="max-w-[90%] sm:max-w-[78%]">
                    <div className={`mb-1.5 flex flex-wrap items-center gap-2 text-xs ${candidate ? "justify-end" : ""}`}>
                      <span className="font-semibold">{candidate ? "You" : "Interviewer"}</span>
                      <span className="tabular-nums text-muted">{timestamp(turn.t_offset_ms)}</span>
                      {cited && <span className="rounded border border-indigo-400/30 bg-indigo-500/15 px-1.5 py-0.5 text-indigo-200">Mentioned in report</span>}
                    </div>
                    <p className={`whitespace-pre-wrap break-words rounded-xl border px-3.5 py-2.5 text-sm leading-relaxed sm:text-base ${candidate ? "border-indigo-400/30 bg-indigo-500/10" : "border-line bg-background"}`}>
                      {segments.map((part, i) => part.highlighted
                        ? <mark key={i} className="rounded bg-indigo-400/25 text-foreground">{part.text}</mark>
                        : <Fragment key={i}>{part.text}</Fragment>)}
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
    </main>
  );
}
