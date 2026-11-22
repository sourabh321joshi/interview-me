"use client";

import { useState, type FormEvent } from "react";

export default function DeleteAccount() {
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function remove(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (confirmation !== "DELETE" || busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/v1/me", { method: "DELETE" });
      if (!response.ok) {
        const result = await response.json().catch(() => null);
        setError(result?.error?.message ?? "Could not delete your account. Try again.");
        setBusy(false);
        return;
      }
      window.location.replace("/");
    } catch {
      setError("Could not reach the server. Try again.");
      setBusy(false);
    }
  }

  return (
    <form className="mt-8 space-y-4" onSubmit={remove}>
      <h2 className="text-xl font-semibold">Delete account and data</h2>
      <p className="text-muted">This permanently removes your account, resume summaries, interviews, transcripts, and reports. Usage counts are kept without a link to your account.</p>
      <label className="block">
        Type DELETE to confirm
        <input className="field mt-2" autoComplete="off" value={confirmation} onChange={event => setConfirmation(event.target.value)} />
      </label>
      {error && <p role="alert" className="text-red-300">{error}</p>}
      <button className="rounded border border-red-400 px-4 py-2 text-red-300 disabled:opacity-50" disabled={confirmation !== "DELETE" || busy}>
        {busy ? "Deleting account..." : "Permanently delete account"}
      </button>
    </form>
  );
}
