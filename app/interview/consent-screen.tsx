"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";

export default function ConsentScreen({ version, provider }: { version: string; provider: string }) {
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!checked || busy) return;
    setError("");
    setBusy(true);
    try {
      const response = await fetch("/api/v1/consent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version, provider }),
      });
      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error?.message);
      }
      window.location.reload();
    } catch (error) {
      setError(error instanceof Error && error.message ? error.message : "Could not save your choice. Try again.");
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-2xl px-5 py-12">
      <h1 className="text-3xl font-semibold">Before your first interview</h1>
      <div className="surface mt-6 space-y-4 p-6 text-muted">
        <p>Interview Me uses text from your resume, any job description you provide, and your answers to tailor questions and generate feedback.</p>
        <p>{provider} receives the text needed for these tasks. If you provide a GitHub username, the GitHub API supplies information about your public repositories.</p>
        <p>MongoDB Atlas stores your profile summary, interview transcript, and feedback report. Interview Me discards the original resume PDF after processing.</p>
        <p>Your transcript and feedback report expire 30 days after the interview ends and are then deleted automatically.</p>
        {provider === "Google Gemini" && <p>Use a fictional resume and answers for this Gemini test setup.</p>}
      </div>
      <form onSubmit={submit} className="mt-6 space-y-4">
        <label className="flex items-start gap-3">
          <input className="mt-1" type="checkbox" required checked={checked} onChange={event => setChecked(event.target.checked)} />
          <span>I agree to the processing described above.</span>
        </label>
        {error && <p role="alert">{error}</p>}
        <div className="flex items-center gap-5">
          <button className="action" disabled={busy || !checked}>{busy ? "Saving…" : "Agree and continue"}</button>
          <Link className="underline" href="/">Go back</Link>
        </div>
      </form>
    </main>
  );
}
