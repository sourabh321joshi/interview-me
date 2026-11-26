"use client";

import Link from "next/link";
import LunaQuestion from "./luna-question";
import LiveCaptions from "../voice-test/live-captions";
import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";

export type RoomTurn = { seq?: number; speaker: "interviewer" | "candidate"; text: string };

type Props = {
  voiceMode: boolean;
  interviewId: string;
  turns: RoomTurn[];
  live: string;
  remaining: number | null;
  finished: boolean;
  replying: boolean;
  awaitingReply: boolean;
  ending: boolean;
  error: string;
  draft: string;
  onDraft: Dispatch<SetStateAction<string>>;
  onSend: () => Promise<void>;
  onRetry: () => void;
  onEnd: () => Promise<void>;
};

function clock(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export default function InterviewRoom({
  voiceMode, interviewId, turns, live, remaining, finished, replying, awaitingReply, ending,
  error, draft, onDraft, onSend, onRetry, onEnd,
}: Props) {
  const [recording, setRecording] = useState(false);
  const [lunaPlaying, setLunaPlaying] = useState(false);
  const [skippedSeq, setSkippedSeq] = useState<number>();
  const latest = turns.at(-1);
  const [speaking, setSpeaking] = useState(false);
  const [playbackError, setPlaybackError] = useState("");
  const utterance = useRef<SpeechSynthesisUtterance | null>(null);
  const [showCaptions, setShowCaptions] = useState(true);
  const visibleLive = showCaptions ? live : "";
  const transcript = useRef<HTMLOListElement>(null);
  const expired = remaining === 0;
  const busy = replying || ending;
  const canAnswer = !finished && !expired && !busy && !awaitingReply;
  const latestQuestion = [...turns].reverse().find(turn => turn.speaker === "interviewer")?.text;

  useEffect(() => {
    const synth = window.speechSynthesis;
    synth?.getVoices();
    return () => {
      const playing = utterance.current;
      utterance.current = null;
      if (playing) synth.cancel();
    };
  }, []);

  function togglePlayback() {
    if (utterance.current) {
      utterance.current = null;
      window.speechSynthesis.cancel();
      setSpeaking(false);
      return;
    }
    if (!latestQuestion || recording || !canAnswer) return;
    const synth = window.speechSynthesis;
    const voices = synth?.getVoices().filter(voice => voice.localService && /^en(?:-|$)/i.test(voice.lang)) ?? [];
    const voice = voices.find(voice => voice.default) ?? voices[0];
    if (!voice) {
      setPlaybackError("No English device voice is available in this browser.");
      return;
    }

    const speech = new SpeechSynthesisUtterance(latestQuestion);
    speech.voice = voice;
    speech.lang = voice.lang;
    function complete(message = "") {
      if (utterance.current !== speech) return;
      utterance.current = null;
      setSpeaking(false);
      setPlaybackError(message);
    }
    speech.onend = () => complete();
    speech.onerror = () => complete("Could not play the question. You can read it in the conversation.");
    utterance.current = speech;
    setPlaybackError("");
    setSpeaking(true);
    try {
      synth.speak(speech);
    } catch {
      complete("Could not play the question. You can read it in the conversation.");
    }
  }

  const status = lunaPlaying ? "Luna is reading the question..." : speaking ? "Playing interviewer question..." : finished ? "Interview complete" : expired ? "Time is up" : ending ? "Ending interview…" : replying
    ? live ? "Interviewer is responding…" : "Interviewer is thinking…"
    : awaitingReply ? "Reply interrupted" : "Your turn";

  useEffect(() => {
    const list = transcript.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [turns, visibleLive]);

  return (
    <main className="mx-auto flex h-dvh max-w-5xl flex-col px-4 py-4 sm:px-8 sm:py-7">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4">
        <div>
          <Link href="/" className="text-sm font-semibold text-indigo-300 hover:text-white">Interview Me</Link>
          <h1 className="mt-1 text-xl font-semibold tracking-tight sm:text-2xl">Practice interview</h1>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {!finished && remaining !== null && (
            <span className={`rounded-lg border border-line bg-panel px-3 py-2 text-sm font-semibold tabular-nums ${remaining <= 30 ? "text-amber-300" : ""}`}
              aria-label="Time left" role="timer">
              {clock(remaining)} left
            </span>
          )}
          {finished ? (
            <Link href={`/report?interview=${interviewId}`} className="action text-sm">View feedback</Link>
          ) : (
            <button type="button" onClick={() => void onEnd()} disabled={busy || speaking}
              className="rounded-lg border border-line px-3 py-2 text-sm font-semibold text-muted hover:border-indigo-400 hover:text-white disabled:opacity-50">
              {ending ? "Ending…" : "End and get feedback"}
            </button>
          )}
        </div>
      </header>

      <section className="surface mt-4 flex min-h-0 flex-1 flex-col overflow-hidden" aria-labelledby="conversation-title">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3 sm:px-6">
          <h2 id="conversation-title" className="text-sm font-semibold">Conversation</h2>
          <div className="flex flex-wrap items-center gap-3">
            {voiceMode && canAnswer && latest?.speaker === "interviewer" && latest.seq !== undefined && latest.seq !== skippedSeq &&
              <LunaQuestion key={latest.seq} id={interviewId} seq={latest.seq} text={latest.text} onSpeaking={setLunaPlaying} />}
            {lunaPlaying && <button type="button" className="text-sm underline" onClick={() => setSkippedSeq(latest?.seq)}>Stop Luna</button>}
            {!lunaPlaying && (speaking || (!finished && latestQuestion)) && <button type="button" onClick={togglePlayback}
              disabled={!speaking && (recording || !canAnswer)}
              className="rounded-lg border border-line px-3 py-1.5 text-sm font-semibold hover:border-indigo-400 disabled:opacity-50">
              {speaking ? "Stop playback" : "Play question"}
            </button>}
            <p role="status" className="text-sm text-muted">{status}</p>
            {!finished && <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input type="checkbox" checked={showCaptions} onChange={event => setShowCaptions(event.target.checked)}
                className="size-4 accent-indigo-500" />
              Live captions
            </label>}
          </div>
        </div>
        <ol ref={transcript} aria-label="Interview transcript" tabIndex={0}
          className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-5 [overflow-anchor:none] focus-visible:outline-offset-[-3px] sm:px-6">
          {turns.map((turn, index) => (
            <li key={index} className={turn.speaker === "candidate" ? "flex justify-end" : ""}>
              <div className="max-w-[90%] sm:max-w-[78%]">
                <p className={`mb-1.5 text-xs font-semibold text-muted ${turn.speaker === "candidate" ? "text-right" : ""}`}>
                  {turn.speaker === "candidate" ? "You" : "Interviewer"}
                </p>
                <p className={`whitespace-pre-wrap break-words rounded-xl border px-3.5 py-2.5 text-sm leading-relaxed sm:text-base ${turn.speaker === "candidate" ? "border-indigo-400/30 bg-indigo-500/15" : "border-line bg-background"}`}>
                  {turn.text}
                </p>
              </div>
            </li>
          ))}
          {visibleLive && (
            <li className="max-w-[90%] sm:max-w-[78%]">
              <p className="mb-1.5 text-xs font-semibold text-muted">Interviewer</p>
              <p className="whitespace-pre-wrap break-words rounded-xl border border-line bg-background px-3.5 py-2.5 text-sm leading-relaxed sm:text-base">{visibleLive}</p>
            </li>
          )}
          {!turns.length && !live && replying && <li className="text-sm text-muted">Waiting for your first question…</li>}
        </ol>
        {playbackError && <p role="status" className="px-4 py-2 text-sm text-muted sm:px-6">{playbackError}</p>}
        {error && (
          <div role="alert" className="mx-4 mb-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-900 bg-red-950/40 px-3 py-2 text-sm text-red-200 sm:mx-6">
            <span>{error}</span>
            {awaitingReply && !busy && !finished && !expired && (
              <button type="button" onClick={onRetry} className="font-semibold underline">Retry reply</button>
            )}
          </div>
        )}
        {!finished && (
          <form onSubmit={(event) => { event.preventDefault(); if (canAnswer && !recording && !speaking) void onSend(); }}
            className="max-h-[60dvh] shrink-0 space-y-2 overflow-y-auto border-t border-line px-4 py-3 sm:px-6">
            <div className="flex items-baseline justify-between gap-3">
              <label htmlFor="interview-answer" className="text-base font-semibold">Your answer</label>
              <span className="text-xs tabular-nums text-muted">{draft.length} / 2000</span>
            </div>
              <textarea id="interview-answer" value={draft} onChange={(event) => onDraft(event.target.value)}
                rows={4} maxLength={2000} disabled={!canAnswer} aria-describedby="interview-answer-hint"
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                    event.preventDefault();
                    event.currentTarget.form?.requestSubmit();
                  }
                }}
                className="field block min-h-[min(7rem,19dvh)] max-h-[28dvh] resize-none overflow-y-auto text-base leading-relaxed [field-sizing:content] sm:min-h-[min(9rem,20dvh)]"
                placeholder={expired ? "The interview time has ended." : awaitingReply ? "Wait for the interviewer’s reply." : "Type your answer…"} />
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
            {canAnswer && <LiveCaptions disabled={speaking || lunaPlaying} interviewId={interviewId} showCaptions={showCaptions} onRecording={setRecording}
              onWords={words => onDraft(previous => [previous.trimEnd(), words].filter(Boolean).join(" ").slice(0, 2000))} />}
                <p id="interview-answer-hint" className="mt-1 hidden text-xs text-muted sm:block">Enter to send · Shift + Enter for a new line</p>
              </div>
              <button disabled={!canAnswer || recording || speaking || !draft.trim()} className="action shrink-0">Send</button>
            </div>
          </form>
        )}
      </section>
    </main>
  );
}
