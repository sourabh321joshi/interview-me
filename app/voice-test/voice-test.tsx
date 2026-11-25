"use client";

import { useEffect, useRef, useState } from "react";
import { previewFrame } from "./preview";

export default function VoiceTest() {
  const [phase, setPhase] = useState<"idle" | "waiting" | "running" | "done">("idle");
  const [frame, setFrame] = useState(() => previewFrame(0, 0));
  const [message, setMessage] = useState("");
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [voiceId, setVoiceId] = useState("");
  const [voiceMessage, setVoiceMessage] = useState("");
  const run = useRef(0);
  const stream = useRef<MediaStream | null>(null);
  const timer = useRef<number | undefined>(undefined);

  function release() {
    run.current++;
    window.clearInterval(timer.current);
    stream.current?.getTracks().forEach(track => track.stop());
    stream.current = null;
  }

  useEffect(() => {
    const synth = window.speechSynthesis;
    const refresh = () => setVoices(synth?.getVoices().filter(voice => voice.localService) ?? []);
    refresh();
    synth?.addEventListener("voiceschanged", refresh);
    return () => {
      release();
      synth?.removeEventListener("voiceschanged", refresh);
      synth?.cancel();
    };
  }, []);

  function stop() {
    release();
    setPhase("done");
  }

  async function start() {
    release();
    const id = run.current;
    setPhase("waiting");
    setMessage("");
    setFrame(previewFrame(0, 0));
    try {
      const audio = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (id !== run.current) {
        audio.getTracks().forEach(track => track.stop());
        return;
      }
      stream.current = audio;
      const track = audio.getAudioTracks()[0];
      track.addEventListener("ended", () => {
        if (id === run.current) {
          stop();
          setMessage("Microphone disconnected.");
        }
      }, { once: true });
      setPhase("running");
      const started = performance.now();
      timer.current = window.setInterval(() => {
        const next = previewFrame(started, performance.now());
        setFrame(next);
        if (next.remaining === 0) stop();
      }, 200);
    } catch {
      if (id !== run.current) return;
      release();
      setPhase("idle");
      setMessage("Microphone unavailable. Check browser permission and your input device, then try again.");
    }
  }

  function play() {
    const voice = voices.find(item => item.voiceURI === voiceId) ?? voices[0];
    if (!voice) return;
    const sample = new SpeechSynthesisUtterance("Tell me about a technical decision you made on your last project.");
    sample.voice = voice;
    sample.onerror = event => {
      if (event.error !== "interrupted" && event.error !== "canceled") setVoiceMessage("Voice playback failed. Try another device voice.");
    };
    setVoiceMessage("");
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(sample);
  }

  const active = phase === "running" || phase === "waiting";
  return <>
    <section className="surface space-y-4 p-5">
      <div className="flex justify-between gap-2"><h2 className="font-semibold">Microphone</h2>
        <span className="font-mono">{frame.remaining === 60 ? "1:00" : "0:" + String(frame.remaining).padStart(2, "0")}</span></div>
      <button className="action" onClick={active ? stop : start}>{phase === "waiting" ? "Cancel" : active ? "Stop test" : "Start microphone test"}</button>
      <p role="status">{message || ({ idle: "Ready", waiting: "Waiting for microphone permission…", running: "Microphone active", done: "Microphone stopped" })[phase]}</p>
      <h3 className="text-sm text-muted">Simulated captions</h3>
      <p aria-live="polite">{phase === "running" || phase === "done" ? frame.caption : "Start the test to see the sample script."}</p>
    </section>
    <section className="surface space-y-4 p-5">
      <h2 className="font-semibold">Interviewer voice sample</h2>
      {voices.length > 0 ? <>
        <label className="block">Device voice<select className="field mt-2" value={voiceId || voices[0].voiceURI} onChange={event => setVoiceId(event.target.value)}>
          {voices.map(voice => <option key={voice.voiceURI} value={voice.voiceURI}>{voice.name} ({voice.lang})</option>)}
        </select></label>
        <button className="action" onClick={play}>Play sample</button>
        <p role="status">{voiceMessage}</p>
      </> : <p className="text-muted">No local speech voices are available in this browser.</p>}
    </section>
  </>;
}
