"use client";

import { useRouter } from "next/navigation";
import AddContext from "./add-context";
import InterviewSetup from "./interview-setup";
import { playQuestionClip } from "./play-question-clip";
import InterviewRoom, { type RoomTurn } from "./interview-room";
import ReviewProfile from "./review-profile";
import type { Warning } from "@/lib/profile-builder";
import type { ProfileSummary } from "@/lib/schemas";
import { useEffect, useRef, useState } from "react";

type VoiceClip = { seq: number; text: string; proof: string };

type TurnRequest = { client_turn_id: string } & (
  { type: "open" } | { type: "answer"; text: string } | { type: "code"; code: string; output?: string }
);

const errorText = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong.");

async function api(url: string, init?: RequestInit) {
  const res = await fetch(url, init);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error?.message ?? `Request failed (${res.status})`);
  return json;
}

// Reads the server-sent events from the turn endpoint.
async function streamTurn(interviewId: string, body: object, onDelta: (t: string) => void, onClip: (clip: VoiceClip) => void) {
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
  let result: { seq: number; text: string; is_final: boolean } | null = null;
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
      else if (event === "voice.clip") onClip(data);
      else if (event === "turn.end") result = { seq: data.seq, text: data.text, is_final: data.is_final };
      else if (event === "error") throw new Error(data.message ?? "The interviewer could not reply.");
    }
  }
  if (!result) throw new Error("The reply was interrupted. Try again to recover it.");
  return result;
}

export default function InterviewPage() {
  const router = useRouter();
  const [stage, setStage] = useState<"context" | "review" | "setup" | "chat">("context");
  const [profile, setProfile] = useState<{ id: string; summary: ProfileSummary; warnings?: Warning[] } | null>(null);
  const [manualJob, setManualJob] = useState("");
  const [interviewId, setInterviewId] = useState("");
  const [streamedVoiceSeq, setStreamedVoiceSeq] = useState<number>();
  const [streamingAudio, setStreamingAudio] = useState(false);
  const [voiceError, setVoiceError] = useState("");
  const voiceRun = useRef<AbortController | null>(null);
  useEffect(() => () => voiceRun.current?.abort(), []);
  const [voiceMode, setVoiceMode] = useState(false);
  const [turns, setTurns] = useState<RoomTurn[]>([]);
  const [live, setLive] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState<TurnRequest | null>(null);
  const [finished, setFinished] = useState(false);
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const [offset, setOffset] = useState(0);
  const [now, setNow] = useState(0);
  const [standard, setStandard] = useState(false);
  const [draft, setDraft] = useState("");
  const [ending, setEnding] = useState(false);
  const plannedInterview = useRef<{ id: string; settings: string } | null>(null);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const remaining = endsAt && now ? Math.max(0, Math.ceil((endsAt - (now + offset)) / 1000)) : null;
  const timeUp = remaining === 0;

  function stopStreamingAudio() {
    voiceRun.current?.abort();
    voiceRun.current = null;
    setStreamingAudio(false);
  }

  useEffect(() => {
    if (timeUp) voiceRun.current?.abort();
  }, [timeUp]);

  async function runTurn(id: string, body: TurnRequest) {
    setError("");
    setLive("");
    setPending(body);
    setBusy("The interviewer is replying…");
    setVoiceError("");
    const controller = new AbortController();
    voiceRun.current?.abort();
    voiceRun.current = controller;
    const requestedAt = performance.now();
    let queue = Promise.resolve();
    let player: HTMLAudioElement | undefined;
    let firstAudio = true;
    function enqueue(clip: VoiceClip) {
      setStreamedVoiceSeq(clip.seq);
      if (controller.signal.aborted) return;
      setStreamingAudio(true);
      player ??= new Audio();
      const audio = player;
      queue = queue.then(() => playQuestionClip(audio, id, clip, controller.signal, () => {
        if (!firstAudio) return;
        firstAudio = false;
        performance.measure("interview-first-audio", { start: requestedAt, end: performance.now() });
      })).catch(() => {
        if (!controller.signal.aborted) {
          setVoiceError("Luna playback unavailable. Select Play question to use your device voice.");
          controller.abort();
        }
      });
    }
    try {
      let acc = "";
      const r = await streamTurn(id, body, (d) => { acc += d; setLive(acc); }, enqueue);
      setTurns((t) => [...t, { speaker: "interviewer", seq: r.seq, text: r.text }]);
      setPending(null);
      if (r.is_final) setFinished(true);
    } catch (e) {
      controller.abort();
      setError(errorText(e));
    } finally {
      void queue.finally(() => {
        if (voiceRun.current === controller) {
          voiceRun.current = null;
          setStreamingAudio(false);
        }
      });
      setLive("");
      setBusy("");
    }
  }

  async function loadInterview(id: string) {
    const v = await api(`/api/v1/interviews/${id}`);
    setInterviewId(id);
    setVoiceMode(v.mode === "voice");
    setStandard(v.duration_seconds === 600);
    setTurns(v.turns.map((t: RoomTurn) => ({ speaker: t.speaker, text: t.text, seq: t.seq, kind: t.kind, output: t.output })));
    setEndsAt(v.ends_at ? new Date(v.ends_at).getTime() : null);
    const receivedAt = Date.now();
    setNow(receivedAt);
    setOffset(new Date(v.server_now).getTime() - receivedAt);
    setStage("chat");
    const over = ["completed", "abandoned", "failed"].includes(v.status);
    setFinished(over);
    const last = v.turns.at(-1);
    if (over || v.status === "plan_ready") return;
    if (!last) await runTurn(id, { type: "open", client_turn_id: crypto.randomUUID() });
    else if (last.speaker === "candidate" && last.client_turn_id) {
      setPending(last.kind === "code"
        ? { type: "code", client_turn_id: last.client_turn_id, code: last.text, output: last.output }
        : { type: "answer", client_turn_id: last.client_turn_id, text: last.text });
      setError("Your last answer is saved. Retry to recover the reply.");
    }
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
      setProfile(profile);
      setStage("review");
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy("");
    }
  }

  async function saveProfile(changes: Partial<Omit<ProfileSummary, "schema_version">>) {
    if (!profile || busy) return;
    setError("");
    setBusy("Saving your profile…");
    try {
      if (!profile.id) {
        const saved = await api("/api/v1/profiles/manual", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ summary: { ...profile.summary, ...changes }, job_description: manualJob }),
        });
        setProfile(saved);
        plannedInterview.current = null;
      } else if (Object.keys(changes).length) {
        const saved = await api(`/api/v1/profiles/${profile.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(changes),
        });
        plannedInterview.current = null;
        setProfile({ ...profile, summary: saved.summary });
      }
      setStage("setup");
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy("");
    }
  }

  async function startInterview(form: FormData) {
    if (!profile || busy) return;
    setError("");
    setBusy("Preparing your interview…");
    const settings = JSON.stringify({
      profile_id: profile.id,
      role: form.get("role"),
      level: form.get("level"),
      duration_seconds: Number(form.get("duration")),
      mode: form.get("luna") ? "voice" : "text",
    });

    try {
      let planned = plannedInterview.current;
      if (planned?.settings !== settings) {
        const interview = await api("/api/v1/interviews", {
          method: "POST", headers: { "Content-Type": "application/json" }, body: settings,
        });
        planned = { id: interview.id, settings };
        plannedInterview.current = planned;
      }
      const iv = planned;
      const started = await api(`/api/v1/interviews/${iv.id}/start`, { method: "POST" });
      plannedInterview.current = null;
      window.history.replaceState(null, "", `?interview=${iv.id}`);
      setVoiceMode(!!form.get("luna"));
      setStandard(Number(form.get("duration")) === 600);
      setInterviewId(iv.id);
      setEndsAt(new Date(started.ends_at).getTime());
      const receivedAt = Date.now();
      setNow(receivedAt);
      setOffset(new Date(started.server_now).getTime() - receivedAt);
      setStage("chat");
      await runTurn(iv.id, { type: "open", client_turn_id: crypto.randomUUID() });
    } catch (err) {
      setError(errorText(err));
      setBusy("");
    }
  }

  async function send() {
    const text = draft.trim();
    if (!text || busy || pending || ending || finished || timeUp) return;
    setDraft("");
    setTurns((t) => [...t, { speaker: "candidate", text }]);
    await runTurn(interviewId, { type: "answer", text, client_turn_id: crypto.randomUUID() });
  }

  async function sendCode(code: string, output?: string) {
    if (!standard || !code.trim() || code.length > 2000 || busy || pending || ending || finished || timeUp) return;
    setTurns(turns => [...turns, { speaker: "candidate", kind: "code", text: code, output }]);
    await runTurn(interviewId, { type: "code", code, output, client_turn_id: crypto.randomUUID() });
  }

  async function endNow() {
    if (busy || ending) return;
    setError("");
    setEnding(true);
    try {
      await api(`/api/v1/interviews/${interviewId}/end`, { method: "POST" });
      router.push(`/report?interview=${interviewId}`);
    } catch (e) {
      setError(errorText(e));
      setEnding(false);
    }
  }

  if (stage !== "chat") {
    return (
      <>
        <div hidden={stage !== "context"}>
          <AddContext onManual={job => {
            setManualJob(job);
            setProfile({ id: "", summary: { schema_version: 1, first_name: "", years_experience: 0, education: [], experience: [], skills: [], projects: [] } });
            setError("");
            setStage("review");
          }} onBuild={buildProfile} busy={busy} error={error} />
        </div>
        {stage === "review" && profile && (
          <ReviewProfile summary={profile.summary} warnings={profile.warnings} busy={!!busy} error={error} onContinue={saveProfile}
            onBack={() => { setError(""); setStage("context"); }} />
        )}
        {profile && (
          <div hidden={stage !== "setup"}>
            <InterviewSetup key={profile.id} busy={busy} error={error} onStart={startInterview}
              onReview={() => { setError(""); setStage("review"); }} />
          </div>
        )}
      </>
    );
  }

  return (
    <InterviewRoom voiceMode={voiceMode}
      streamedVoiceSeq={streamedVoiceSeq}
      streamingAudio={streamingAudio}
      voiceError={voiceError}
      onStopStreamingAudio={stopStreamingAudio}
      interviewId={interviewId}
      turns={turns}
      live={live}
      remaining={remaining}
      finished={finished}
      replying={!!busy}
      awaitingReply={!!pending}
      ending={ending}
      error={error}
      draft={draft}
      onDraft={setDraft}
      onSend={send}
      onSendCode={standard ? sendCode : undefined}
      onRetry={() => { if (pending && !busy && !ending && !finished && !timeUp) void runTurn(interviewId, pending); }}
      onEnd={endNow}
    />
  );
}
