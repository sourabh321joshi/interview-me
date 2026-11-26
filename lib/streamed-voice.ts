import { createHmac, timingSafeEqual } from "node:crypto";

export function voiceProof(userId: string, interviewId: string, seq: number, text: string) {
  const secret = process.env.BETTER_AUTH_SECRET;
  return secret && createHmac("sha256", secret).update(JSON.stringify(["streamed-question", userId, interviewId, seq, text])).digest("hex");
}

export function matchesVoiceProof(proof: string | undefined, userId: string, interviewId: string, seq: number, text: string) {
  const expected = voiceProof(userId, interviewId, seq, text);
  return !!(proof && expected && /^[a-f0-9]{64}$/.test(proof) &&
    timingSafeEqual(Buffer.from(proof, "hex"), Buffer.from(expected, "hex")));
}

export function questionSegments(text: string, finished: boolean) {
  const sentences = [...new Intl.Segmenter("en", { granularity: "sentence" }).segment(text)];
  const ready = finished ? sentences : sentences.slice(0, -1);
  const clips = ready.flatMap(({ segment }) => {
    const pieces: string[] = [];
    const chars = Array.from(segment.trim());
    for (let i = 0; i < chars.length; i += 250) pieces.push(chars.slice(i, i + 250).join("").trim());
    return pieces.filter(Boolean);
  });
  return { clips, tail: finished ? "" : sentences.at(-1)?.segment ?? "" };
}
