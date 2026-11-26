import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { ObjectId } from "mongodb";
import { COLLECTIONS, getClientPromise, getDb } from "./db";

function sign(user: string, interview: string, id: string) {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) return null;
  return createHmac("sha256", secret).update(JSON.stringify(["stt-usage", user, interview, id])).digest("hex");
}

export function voiceUsageReceipt(user: string, interview: string) {
  const id = randomUUID();
  const proof = sign(user, interview, id);
  return proof ? { id, proof } : undefined;
}

export function verifyVoiceUsageReceipt(user: string, interview: string, id: string, proof: string) {
  const expected = sign(user, interview, id);
  return !!(expected && /^[a-f0-9]{64}$/.test(proof) &&
    timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(proof, "hex")));
}

export function voiceCostUsd(kind: "stt" | "tts", amount: number, env: Record<string, string | undefined> = process.env) {
  const value = kind === "stt" ? env.DEEPGRAM_STT_USD_PER_MINUTE : env.DEEPGRAM_TTS_USD_PER_1M_CHARACTERS;
  const rate = value?.trim() ? Number(value) : NaN;
  return Number.isFinite(rate) && rate >= 0 ? amount * rate / (kind === "stt" ? 60 : 1e6) : null;
}

export async function recordSpeechUsage(user: string, interview: string, receipt: string, seconds: number, source: string) {
  const client = await getClientPromise();
  const db = await getDb();
  const _id = new ObjectId(interview);
  const cost = voiceCostUsd("stt", seconds);
  await client.withSession(session => session.withTransaction(async () => {
    const tally = await db.collection(COLLECTIONS.interviews).updateOne(
      { _id, user_id: user, stt_usage_receipts: { $ne: receipt }, $or: [{ expire_at: null }, { expire_at: { $gt: new Date() } }] },
      { $addToSet: { stt_usage_receipts: receipt }, $inc: { "usage_totals.stt_seconds": seconds, "usage_totals.est_cost_usd": cost ?? 0 } },
      { session },
    );
    if (!tally.modifiedCount) return;
    await db.collection(COLLECTIONS.usage_events).insertOne({
      user_id: user, interview_id: _id, provider: "deepgram", kind: "stt", role: "voice", model: "nova-3",
      stt_seconds: seconds, duration_source: source, est_cost_usd: cost, created_at: new Date(),
    }, { session });
  }));
}
