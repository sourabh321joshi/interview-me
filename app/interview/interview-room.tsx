"use client";

import Link from "next/link";
import { runJavaScript } from "./run-javascript";
import CodeEditor from "./code-editor";
import LunaQuestion from "./luna-question";
import LiveCaptions from "../voice-test/live-captions";
import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";

export type RoomTurn = { seq?: number; speaker: "interviewer" | "candidate"; kind?: string; output?: string; text: string };

type Props = {
  voiceMode: boolean;
  streamedVoiceSeq?: number;
  streamingAudio: boolean;
  voiceError: string;
  onStopStreamingAudio: () => void;
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
  onSendCode?: (code: string, output?: string) => Promise<void>;
  onRetry: () => void;
  onEnd: () => Promise<void>;
};

function clock(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export default function InterviewRoom({
  voiceMode, streamedVoiceSeq, streamingAudio, voiceError, onStopStreamingAudio, interviewId, turns, live, remaining, finished, replying, awaitingReply, ending,
  error, draft, onDraft, onSend, onSendCode, onRetry, onEnd,
}: Props) {
  const [editingCode, setEditingCode] = useState(false);
  const [code, setCode] = useState("");
  const [runningCode, setRunningCode] = useState(false);
  const [codeResult, setCodeResult] = useState<{ source: string; output: string }>();
  const codeRun = useRef<AbortController | null>(null);
  useEffect(() => () => codeRun.current?.abort(), []);
  const output = codeResult?.source === code ? codeResult.output : undefined;

  async function runCode() {
    if (codeRun.current) return;
    const controller = new AbortController();
    codeRun.current = controller;
    setRunningCode(true);
    setCodeResult(undefined);
    try {
      const result = await runJavaScript(code, controller.signal);
      setCodeResult({ source: code, output: result });
    } catch {
      if (!controller.signal.aborted) setCodeResult({ source: code, output: "The JavaScript runner could not start." });
    } finally {
      codeRun.current = null;
      if (!controller.signal.aborted) setRunningCode(false);
    }
  }
  const [recording, setRecording] = useState(false);
  const [completedAudio, setCompletedAudio] = useState(false);
  const lunaPlaying = completedAudio || streamingAudio;
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
  const canSubmit = canAnswer && !recording && !speaking && !lunaPlaying;
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
            <button type="button" onClick={() => void onEnd()} disabled={busy || speaking || lunaPlaying}
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
            {voiceMode && canAnswer && latest?.speaker === "interviewer" && latest.seq !== undefined && latest.seq !== skippedSeq && latest.seq !== streamedVoiceSeq &&
              <LunaQuestion key={latest.seq} id={interviewId} seq={latest.seq} text={latest.text} onSpeaking={setCompletedAudio} />}
            {lunaPlaying && <button type="button" className="text-sm underline" onClick={streamingAudio ? onStopStreamingAudio : () => setSkippedSeq(latest?.seq)}>Stop Luna</button>}
            {!lunaPlaying && (speaking || (!finished && latestQuestion)) && <button type="button" onClick={togglePlayback}
              disabled={!speaking && (recording || !canAnswer)}
              className="rounded-lg border border-line px-3 py-1.5 text-sm font-semibold hover:border-indigo-400 disabled:opacity-50">
              {speaking ? "Stop playback" : "Play question"}
            </button>}
            <p role="status" className="text-sm text-muted">{voiceError || status}</p>
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
                  {turn.kind === "code" ? <>
                    <code className="block whitespace-pre-wrap font-mono">{turn.text}</code>
                    {turn.output && <code className="mt-2 block border-t border-line pt-2 font-mono text-muted">{turn.output}</code>}
                  </> : turn.text}
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
          <form onSubmit={(event) => {
            event.preventDefault();
            if (!canSubmit) return;
            if (editingCode && !runningCode) void onSendCode?.(code, output);
            else if (!editingCode) void onSend();
          }} className="max-h-[60dvh] shrink-0 space-y-2 overflow-y-auto border-t border-line px-4 py-3 sm:px-6">
            {onSendCode && <button type="button" aria-pressed={editingCode} disabled={recording}
              className="text-sm font-semibold text-indigo-300 underline disabled:opacity-50"
              onClick={() => setEditingCode(!editingCode)}>JavaScript editor</button>}
            {editingCode ? <>
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-semibold">JavaScript</span>
                <span className={code.length > 2000 ? "text-xs text-red-300" : "text-xs text-muted"}>{code.length} / 2000</span>
              </div>
              <CodeEditor value={code} onChange={setCode} disabled={!canAnswer} />
              <div className="flex flex-wrap gap-2">
                <button type="button" className="rounded-lg border border-line px-3 py-2 text-sm font-semibold disabled:opacity-50"
                  disabled={!canAnswer || runningCode || !code.trim() || code.length > 2000} onClick={() => void runCode()}>
                  {runningCode ? "Running..." : "Run code"}
                </button>
                <button className="action" disabled={!canSubmit || runningCode || !code.trim() || code.length > 2000}>Submit code</button>
              </div>
              {output !== undefined && <section aria-label="Code output" className="rounded-lg border border-line bg-background p-3">
                <h3 className="text-sm font-semibold">Output</h3>
                <pre role="status" className="mt-1 max-h-36 overflow-auto whitespace-pre-wrap break-words text-sm">{output}</pre>
              </section>}
            </> : <>
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
              <button disabled={!canSubmit || !draft.trim()} className="action shrink-0">Send</button>
            </div>
            </>}
          </form>
        )}
      </section>
    </main>
  );
}
