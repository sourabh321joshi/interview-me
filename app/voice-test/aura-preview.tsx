"use client";

import { useEffect, useRef, useState } from "react";

export default function AuraPreview() {
  const clips = useRef(new Map<string, string>());
  const pending = useRef<AbortController | null>(null);
  const player = useRef<HTMLAudioElement>(null);
  const [loading, setLoading] = useState(false);
  const [voice, setVoice] = useState("asteria");
  const [status, setStatus] = useState("");
  useEffect(() => {
    const urls = clips.current;
    return () => {
      pending.current?.abort();
      for (const url of urls.values()) URL.revokeObjectURL(url);
      urls.clear();
    };
  }, []);

  async function preview() {
    if (pending.current) return;
    const controller = new AbortController();
    pending.current = controller;
    setLoading(true);
    setStatus("");
    try {
      let url = clips.current.get(voice);
      if (!url) {
        const res = await fetch("/api/v1/voice-test/sample", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ voice }), signal: controller.signal,
        });
        if (!res.ok) throw new Error((await res.json()).error.message);
        const blob = await res.blob();
        if (controller.signal.aborted) return;
        url = URL.createObjectURL(blob);
        clips.current.set(voice, url);
      }
      if (player.current) {
        player.current.src = url;
        await player.current.play();
      }
    } catch (error) {
      if (!controller.signal.aborted) setStatus(error instanceof Error ? error.message : "Sample playback failed.");
    } finally {
      pending.current = null;
      if (!controller.signal.aborted) setLoading(false);
    }
  }
  return <section className="surface space-y-3 p-5">
    <h2 className="font-semibold">Compare Deepgram voices</h2>
    <p className="text-sm text-muted">Hear the same UPI interview question in two voices. The first preview of each voice uses Deepgram credits.</p>
    <label className="block">Interviewer voice
      <select className="field mt-1" value={voice} disabled={loading} onChange={e => {
        player.current?.pause();
        player.current?.removeAttribute("src");
        player.current?.load();
        setVoice(e.target.value);
        setStatus("");
      }}>
        <option value="asteria">Asteria</option><option value="luna">Luna</option>
      </select>
    </label>
    <button type="button" className="action" disabled={loading} onClick={preview}>{loading ? "Loading sample..." : "Preview voice"}</button>
    <audio ref={player} controls aria-label="Deepgram voice sample" className="w-full" />
    <p role="status">{status}</p>
  </section>;
}
