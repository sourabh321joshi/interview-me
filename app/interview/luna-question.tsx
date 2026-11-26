"use client";

import { useEffect, useState } from "react";

export default function LunaQuestion({ id, seq, text, onSpeaking }: {
  id: string; seq: number; text: string; onSpeaking: (value: boolean) => void;
}) {
  const [status, setStatus] = useState("");
  const [audio] = useState(() => new Audio());
  useEffect(() => {
    const controller = new AbortController();
    let url = "";
    async function play() {
      onSpeaking(true);
      try {
        const sentences = Array.from(new Intl.Segmenter("en", { granularity: "sentence" }).segment(text), part => part.segment.trim());
        for (const sentence of sentences) {
          for (let i = 0; i < sentence.length; i += 500) {
            const res = await fetch("/api/v1/voice/tts", { method: "POST", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ interview_id: id, seq, text: sentence.slice(i, i + 500) }), signal: controller.signal });
            if (!res.ok) throw new Error();
            const blob = await res.blob();
            if (controller.signal.aborted) return;
            url = URL.createObjectURL(blob);
            audio.src = url;
            await new Promise<void>((resolve, reject) => {
              audio.onended = () => resolve();
              audio.onerror = () => reject(new Error());
              audio.onpause = () => { if (controller.signal.aborted) resolve(); };
              audio.play().catch(reject);
            });
            URL.revokeObjectURL(url);
            url = "";
            if (controller.signal.aborted) return;
          }
        }
      } catch {
        if (!controller.signal.aborted) setStatus("Luna playback unavailable. Select Play question to use your device voice.");
      } finally {
        if (!controller.signal.aborted) onSpeaking(false);
      }
    }
    const timer = setTimeout(() => void play(), 0);
    return () => {
      clearTimeout(timer);
      controller.abort();
      audio.pause();
      if (url) URL.revokeObjectURL(url);
      onSpeaking(false);
    };
  }, [id, seq, text, audio, onSpeaking]);
  return status ? <span role="status" className="text-xs text-muted">{status}</span> : null;
}
