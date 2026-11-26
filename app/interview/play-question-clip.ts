export async function playQuestionClip(
  audio: HTMLAudioElement, id: string, clip: { seq: number; text: string; proof?: string },
  signal: AbortSignal, onPlaying?: () => void,
) {
  signal.throwIfAborted();
  const response = await fetch("/api/v1/voice/tts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ interview_id: id, ...clip }),
    signal,
  });
  if (!response.ok) throw new Error("Question audio unavailable");
  const blob = await response.blob();
  signal.throwIfAborted();
  const url = URL.createObjectURL(blob);
  let cancel = () => {};
  try {
    audio.src = url;
    await new Promise<void>((resolve, reject) => {
      cancel = () => reject(signal.reason);
      signal.addEventListener("abort", cancel, { once: true });
      audio.onended = () => resolve();
      audio.onerror = () => reject(new Error("Question audio failed"));
      audio.play().then(() => { if (!signal.aborted) onPlaying?.(); }, reject);
    });
  } finally {
    signal.removeEventListener("abort", cancel);
    audio.onended = null;
    audio.onerror = null;
    audio.pause();
    URL.revokeObjectURL(url);
  }
}
