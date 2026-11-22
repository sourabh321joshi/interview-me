"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const phases = [
  "Reviewing your answers",
  "Finding specific moments",
  "Writing your top fixes",
];

export default function ReportWrapUp({ ready, onViewReport }: { ready: boolean; onViewReport: () => void }) {
  const [phase, setPhase] = useState(0);
  useEffect(() => {
    if (ready) return;
    const timer = window.setInterval(() => setPhase((current) => (current + 1) % phases.length), 2500);
    return () => window.clearInterval(timer);
  }, [ready]);

  return (
    <main className="mx-auto max-w-5xl px-5 pb-12 sm:px-8">
      <header className="border-b border-line py-5">
        <Link href="/" className="font-semibold hover:text-indigo-300">Interview Me</Link>
      </header>
      <section className="surface mx-auto mt-10 max-w-xl px-5 py-10 text-center sm:mt-16 sm:px-9 sm:py-14"
        aria-labelledby="wrap-up-title">
        {ready ? (
          <span aria-hidden="true" className="mx-auto mb-5 flex size-12 items-center justify-center rounded-full bg-indigo-500/15 text-2xl text-indigo-200">✓</span>
        ) : (
          <span aria-hidden="true" className="mx-auto mb-5 block size-12 rounded-full border-2 border-line border-t-indigo-300 motion-safe:animate-spin" />
        )}
        <h1 id="wrap-up-title" className="text-2xl font-semibold tracking-tight sm:text-3xl">Great work, interview complete.</h1>
        {ready ? (
          <>
            <p role="status" className="mt-3 text-muted">Your feedback is ready.</p>
            <button type="button" onClick={onViewReport} className="action mt-6">View my report</button>
          </>
        ) : (
          <>
            <p role="status" className="mt-3 text-muted">We’re preparing your feedback. This usually takes under a minute.</p>
            <p aria-hidden="true" className="mt-5 text-sm font-semibold text-indigo-200">{phases[phase]}</p>
          </>
        )}
      </section>
    </main>
  );
}
