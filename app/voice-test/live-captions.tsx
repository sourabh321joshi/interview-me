"use client";

import { useEffect, useRef, useState } from "react";

export default function LiveCaptions() {
  const [active, setActive] = useState(false);
  const [status, setStatus] = useState("");
  const [caption, setCaption] = useState("");
  const cancel = useRef<(() => void) | null>(null);
  const finish = useRef<(() => void) | null>(null);
  useEffect(() => () => cancel.current?.(), []);

  async function start() {
    if (cancel.current) return;
    let closed = false;
    let stopping = false;
    let finalText = "";
    let mic: MediaStream | undefined;
    let socket: WebSocket | undefined;
    let recorder: MediaRecorder | undefined;
    let timer: number | undefined;
    const abort = new AbortController();
    function release() {
      closed = true;
      abort.abort();
      clearTimeout(timer);
      if (recorder?.state === "recording") recorder.stop();
      mic?.getTracks().forEach(track => track.stop());
      socket?.close();
      cancel.current = null;
      finish.current = null;
    }
    function end(message: string) {
      if (closed) return;
      release();
      setStatus(message);
      setActive(false);
    }
    function stop() {
      if (stopping) return;
      if (recorder?.state !== "recording") return end("Stopped.");
      stopping = true;
      recorder.stop();
      mic?.getTracks().forEach(track => track.stop());
      setStatus("Finishing captions…");
      clearTimeout(timer);
      timer = window.setTimeout(() => end("Stopped."), 4000);
    }
    cancel.current = release;
    finish.current = stop;
    setActive(true);
    setCaption("");
    setStatus("Waiting for microphone permission…");
    try {
      const audio = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (closed) { audio.getTracks().forEach(track => track.stop()); return; }
      mic = audio;
      recorder = new MediaRecorder(audio);
      mic.getAudioTracks()[0].addEventListener("ended", stop, { once: true });
      setStatus("Connecting to Deepgram…");
      timer = window.setTimeout(() => end("Connection timed out. Try again."), 15000);
      const response = await fetch("/api/v1/voice-test/token", { method: "POST", signal: abort.signal });
      const data = await response.json();
      if (closed) return;
      if (!response.ok) return end(data.error?.message ?? "Could not connect.");
      const ws = new WebSocket("wss://api.deepgram.com/v1/listen?model=nova-3&language=multi&smart_format=true&interim_results=true", ["bearer", data.access_token]);
      socket = ws;
      recorder.ondataavailable = event => {
        if (!closed && ws.readyState === WebSocket.OPEN && event.data.size) ws.send(event.data);
      };
      recorder.onstop = () => {
        if (!closed && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "CloseStream" }));
      };
      recorder.onerror = () => end("Microphone recording failed.");
      ws.onopen = () => {
        if (closed) return;
        try { recorder!.start(250); } catch { return end("Browser could not start recording."); }
        setStatus("Listening · stops after one minute");
        clearTimeout(timer);
        timer = window.setTimeout(stop, 60000);
      };
      ws.onmessage = event => {
        if (closed) return;
        const result = JSON.parse(event.data);
        if (result.type !== "Results") return;
        const words = result.channel?.alternatives?.[0]?.transcript ?? "";
        const text = [finalText, words].filter(Boolean).join(" ");
        if (result.is_final) finalText = text;
        setCaption(text);
      };
      ws.onerror = () => end("Deepgram connection failed. Try the local microphone test.");
      ws.onclose = () => end(stopping ? "Stopped." : "Deepgram disconnected.");
    } catch {
      end("Could not start live captions. Check your microphone permission and connection.");
    }
  }
  return <section className="surface space-y-4 p-5">
    <h2 className="font-semibold">Live captions</h2>
    <p className="text-muted">Starting sends microphone audio to Deepgram for up to one minute. Speak in English or Hinglish. Deepgram usage charges may apply.</p>
    <button className="action" onClick={active ? () => finish.current?.() : start}>{active ? "Stop live captions" : "Start live captions"}</button>
    <p role="status">{status}</p>
    <p aria-live="polite">{caption}</p>
  </section>;
}
