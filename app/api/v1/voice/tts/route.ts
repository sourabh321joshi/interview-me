import { ObjectId } from "mongodb";
import { z } from "zod";
import { apiError } from "@/lib/api-error";
import { getCurrentUserId } from "@/lib/auth";
import { consentRequired } from "@/lib/consent";
import { COLLECTIONS, getDb } from "@/lib/db";
import { matchesVoiceProof } from "@/lib/streamed-voice";
import { rateLimited } from "@/lib/route-guard";

const input = z.object({ interview_id: z.string().regex(/^[a-f0-9]{24}$/i), seq: z.number().int().nonnegative(), text: z.string().trim().min(1).max(500), proof: z.string().length(64).optional() });
const model = "aura-2-luna-en";

export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin) return apiError("validation_failed", "Start playback from the interview.");
  const user = await getCurrentUserId(request.headers);
  if (!user) return apiError("unauthenticated", "Sign in to continue.");
  const limited = await rateLimited(user, "general");
  if (limited) return limited;
  const consent = await consentRequired(user);
  if (consent) return consent;
  const parsed = input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("validation_failed", "Invalid question audio request.");
  const { interview_id, seq, text, proof } = parsed.data;
  const key = process.env.DEEPGRAM_API_KEY?.trim();
  if (!key) return apiError("upstream_unavailable", "Deepgram is unavailable.");
  const db = await getDb();
  const interviews = db.collection(COLLECTIONS.interviews);
  const owner = { _id: new ObjectId(interview_id), user_id: user };
  const streamed = matchesVoiceProof(proof, user, interview_id, seq, text);
  // The final sentence may reach the browser just after the interview is marked complete.
  const active = { ...owner, mode: "voice", status: streamed ? { $in: ["in_progress", "completed"] } : "in_progress", ends_at: { $gt: new Date() } };
  const iv = await interviews.findOne(active, { projection: { turns: { $elemMatch: { seq, speaker: "interviewer" } } } });
  if (!iv || !(streamed || iv.turns?.[0]?.text.includes(text))) {
    return apiError("interview_not_active", "Question unavailable for playback.");
  }
  const reserved = await interviews.updateOne({ ...active, $or: [
    { "usage_totals.tts_characters": { $exists: false } }, { "usage_totals.tts_characters": { $lte: 6000 - text.length } },
  ] }, { $inc: { "usage_totals.tts_characters": text.length } });
  if (!reserved.modifiedCount) return apiError("rate_limited", "Voice playback budget reached.");
  let audio: ArrayBuffer;
  try {
    const result = await fetch("https://api.deepgram.com/v1/speak?model=aura-2-luna-en&encoding=mp3", {
      method: "POST", headers: { Authorization: "Token " + key, "Content-Type": "application/json" },
      body: JSON.stringify({ text }), signal: AbortSignal.timeout(15000),
    });
    if (!result.ok) throw new Error();
    audio = await result.arrayBuffer();
  } catch {
    await interviews.updateOne(owner, { $inc: { "usage_totals.tts_characters": -text.length } });
    return apiError("upstream_unavailable", "Question audio unavailable.");
  }
  await db.collection(COLLECTIONS.usage_events).insertOne({ user_id: user, interview_id: owner._id, kind: "tts", role: "voice", provider: "deepgram", model, tts_characters: text.length, created_at: new Date() });
  return new Response(audio, { headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" } });
}
