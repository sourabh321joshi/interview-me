"use client";

import { playQuestionClip } from "./play-question-clip";
import { useEffect, useState } from "react";

export default function LunaQuestion({ id, seq, text, onSpeaking }: {
  id: string; seq: number; text: string; onSpeaking: (value: boolean) => void;
}) {
  const [status, setStatus] = useState("");
  const [audio] = useState(() => new Audio());
  useEffect(() => {
    const controller = new AbortController();
    async function play() {
      onSpeaking(true);
      try {
        const sentences = Array.from(new Intl.Segmenter("en", { granularity: "sentence" }).segment(text), part => part.segment.trim());
        for (const sentence of sentences) {
          for (let i = 0; i < sentence.length; i += 500) {
            await playQuestionClip(audio, id, { seq, text: sentence.slice(i, i + 500) }, controller.signal);
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
      onSpeaking(false);
    };
  }, [id, seq, text, audio, onSpeaking]);
  return status ? <span role="status" className="text-xs text-muted">{status}</span> : null;
}
