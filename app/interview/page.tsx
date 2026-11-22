"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import AddContext from "./add-context";
import { useEffect, useRef, useState } from "react";

type Turn = { speaker: "interviewer" | "candidate"; text: string };
type Pending = { id: string; text: string };

const errorText = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong.");

async function api(url: string, init?: RequestInit) {
  const res = await fetch(url, init);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error?.message ?? `Request failed (${res.status})`);
  return json;
}

// Reads the server-sent events from the turn endpoint.
async function streamTurn(interviewId: string, body: object, onDelta: (t: string) => void) {
  const res = await fetch(`/api/v1/interviews/${interviewId}/turns`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  if (!res.ok || !res.body) {
    const json = await res.json().catch(() => ({}));
    throw new Error(json?.error?.message ?? "Request failed");
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let result = { text: "", is_final: false };
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let i: number;
    while ((i = buf.indexOf("\n\n")) >= 0) {
      const frame = buf.slice(0, i);
      buf = buf.slice(i + 2);
      const event = /event: (.+)/.exec(frame)?.[1];
      const data = JSON.parse(/data: (.+)/.exec(frame)?.[1] ?? "{}");
      if (event === "text.delta") onDelta(data.text);
      else if (event === "turn.end") result = { text: data.text, is_final: data.is_final };
      else if (event === "error") throw new Error(data.message ?? "The interviewer could not reply.");
    }
  }
  return result;
}

const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

export default function InterviewPage() {
  const router = useRouter();
  const [stage, setStage] = useState<"context" | "setup" | "chat">("context");
  const [profileId, setProfileId] = useState("");
  const [interviewId, setInterviewId] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [live, setLive] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState<Pending | null>(null);
  const [finished, setFinished] = useState(false);
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const [offset, setOffset] = useState(0);
  const [now, setNow] = useState(0);
  const [draft, setDraft] = useState("");
  const bottom = useRef<HTMLLIElement>(null);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => bottom.current?.scrollIntoView({ block: "end" }), [turns, live]);

  const remaining = endsAt && now ? Math.max(0, Math.round((endsAt - (now + offset)) / 1000)) : null;
  const timeUp = remaining === 0;

  async function runTurn(id: string, body: { type: string; text?: string; client_turn_id: string }) {
    setError("");
    setLive("");
    setBusy("The interviewer is replying…");
    try {
      let acc = "";
      const r = await streamTurn(id, body, (d) => { acc += d; setLive(acc); });
      setTurns((t) => [...t, { speaker: "interviewer", text: r.text }]);
      setPending(null);
      if (r.is_final) setFinished(true);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setLive("");
      setBusy("");
    }
  }

  async function loadInterview(id: string) {
    const v = await api(`/api/v1/interviews/${id}`);
    setInterviewId(id);
    setTurns(v.turns.map((t: Turn) => ({ speaker: t.speaker, text: t.text })));
    setEndsAt(v.ends_at ? new Date(v.ends_at).getTime() : null);
    setOffset(new Date(v.server_now).getTime() - Date.now());
    setStage("chat");
    const over = ["completed", "abandoned", "failed"].includes(v.status);
    setFinished(over);
    const last = v.turns.at(-1);
    if (over || v.status === "plan_ready") return;
    if (!last) await runTurn(id, { type: "open", client_turn_id: crypto.randomUUID() });
    else if (last.speaker === "candidate") setPending({ id: last.client_turn_id, text: last.text });
  }

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("interview");
    if (id) Promise.resolve().then(() => loadInterview(id)).catch((e) => setError(errorText(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function buildProfile(form: FormData) {
    if (busy) return;
    setError("");
    setBusy("Building your profile…");
    try {
      const profile = await api("/api/v1/profiles", { method: "POST", body: form });
      setProfileId(profile.id);
      setStage("setup");
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy("");
    }
  }

  async function startInterview(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    if (!profileId || busy) return;
    const f = new FormData(e.currentTarget);
    try {
      setBusy("Planning your interview…");
      const iv = await api("/api/v1/interviews", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile_id: profileId, role: f.get("role"), level: f.get("level"), duration_seconds: Number(f.get("duration")), mode: "text" }),
      });
      const started = await api(`/api/v1/interviews/${iv.id}/start`, { method: "POST" });
      window.history.replaceState(null, "", `?interview=${iv.id}`);
      setInterviewId(iv.id);
      setEndsAt(new Date(started.ends_at).getTime());
      setOffset(new Date(started.server_now).getTime() - Date.now());
      setStage("chat");
      await runTurn(iv.id, { type: "open", client_turn_id: crypto.randomUUID() });
    } catch (err) {
      setError(errorText(err));
      setBusy("");
    }
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text || busy) return;
    const answer = { id: crypto.randomUUID(), text };
    setDraft("");
    setPending(answer);
    setTurns((t) => [...t, { speaker: "candidate", text }]);
    await runTurn(interviewId, { type: "answer", text, client_turn_id: answer.id });
  }

  async function endNow() {
    try {
      await api(`/api/v1/interviews/${interviewId}/end`, { method: "POST" });
      router.push(`/report?interview=${interviewId}`);
    } catch (e) {
      setError(errorText(e));
    }
  }

  const field = "field mt-2";

  if (stage !== "chat") {
    return (
      <>
        <div hidden={stage !== "context"}>
          <AddContext onBuild={buildProfile} busy={busy} error={error} />
        </div>
        {stage === "setup" && (
          <main className="mx-auto max-w-3xl px-5 py-8 sm:py-12">
            <Link href="/" className="text-sm font-semibold text-indigo-300">Interview Me</Link>
            <h1 className="mt-5 text-3xl font-semibold tracking-tight sm:text-4xl">Set up your interview</h1>
            <p className="mt-2 text-muted">Your profile is ready. Choose what you want to practice.</p>
            <form onSubmit={startInterview} className="surface mt-6 space-y-5 p-5 sm:p-7">
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="block text-sm">Role
                  <select name="role" className={field}><option value="frontend">Frontend</option><option value="backend">Backend</option><option value="fullstack">Full-stack</option></select>
                </label>
                <label className="block text-sm">Level
                  <select name="level" className={field}><option value="fresher">Fresher</option><option value="junior">1–3 years</option></select>
                </label>
                <label className="block text-sm">Length
                  <select name="duration" className={field}><option value="300">5 minutes</option><option value="600">10 minutes</option></select>
                </label>
              </div>
              <div className="flex flex-wrap items-center gap-4">
                <button disabled={!!busy} className="action">{busy || "Start interview"}</button>
                <button type="button" disabled={!!busy} className="text-sm font-semibold text-indigo-300 underline disabled:opacity-50" onClick={() => { setError(""); setStage("context"); }}>Change context</button>
              </div>
              {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
            </form>
          </main>
        )}
      </>
    );
  }

  return (
    <main className="mx-auto flex h-dvh max-w-4xl flex-col px-4 py-4 sm:px-8 sm:py-7">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4">
        <div><p className="text-xs font-semibold text-indigo-300">Interview Me</p><h1 className="mt-1 text-xl font-semibold">Practice interview</h1></div>
        <div className="flex items-center gap-4">
          <span className="rounded-lg border border-line bg-panel px-3 py-2 text-sm font-semibold tabular-nums" aria-live="off">{finished ? "Finished" : timeUp ? "Time is up" : remaining === null ? "" : `${clock(remaining)} left`}</span>
          {finished ? <a className="text-sm underline" href={`/report?interview=${interviewId}`}>View feedback</a> : <button onClick={endNow} disabled={!!busy} className="text-sm underline disabled:opacity-50">End and get feedback</button>}
        </div>
      </header>
      <ul className="min-h-0 flex-1 space-y-5 overflow-y-auto py-5">
        {turns.map((t, i) => (
          <li key={i} className={t.speaker === "candidate" ? "text-right" : ""}>
            <span className="mb-1 block text-xs font-medium text-muted">{t.speaker === "candidate" ? "You" : "Interviewer"}</span>
            <p className={`inline-block max-w-[85%] whitespace-pre-wrap rounded-lg px-3 py-2 text-left ${t.speaker === "candidate" ? "bg-indigo-600 text-white" : "border border-line bg-panel"}`}>{t.text}</p>
          </li>
        ))}
        {live && <li><p className="inline-block max-w-[85%] whitespace-pre-wrap rounded-lg border border-line bg-panel px-3 py-2">{live}</p></li>}
        <li ref={bottom} aria-hidden="true" />
      </ul>
      {error && (
        <div role="alert" className="mb-2 flex items-center justify-between rounded-lg border border-red-900 bg-red-950/50 px-3 py-2 text-sm text-red-200">
          <span>{error}</span>
          {pending && <button onClick={() => runTurn(interviewId, { type: "answer", text: pending.text, client_turn_id: pending.id })} className="font-medium underline">Retry</button>}
        </div>
      )}
      <form onSubmit={send} className="flex items-end gap-2 border-t border-line pt-4">
        <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={2} disabled={finished || timeUp || !!busy} aria-label="Your answer"
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); e.currentTarget.form?.requestSubmit(); } }}
          className="field flex-1 resize-y" placeholder={finished ? "The interview is over." : "Type your answer. Enter to send."} />
        <button disabled={finished || timeUp || !!busy || !draft.trim()} className="action">Send</button>
      </form>
    </main>
  );
}
