import { ObjectId, type Document, type UpdateFilter } from "mongodb";
import { COLLECTIONS, getDb } from "./db";
import { interviewExpiry } from "./retention";
import type { Plan } from "./interview-schemas";

export type InterviewStatus = "created" | "plan_ready" | "in_progress" | "wrapping_up" | "completed" | "abandoned" | "failed";
export type SlotSource = "free" | "paid";
export type EndReason = "model_finished" | "user_ended" | "timeout" | "error";
export type Turn = {
  seq: number; speaker: "interviewer" | "candidate"; kind: "speech" | "text" | "code" | "system"; text: string;
  t_offset_ms: number; client_turn_id: string | null; created_at: Date;
};
export type InterviewDoc = {
  id: string; user_id: string; profile_id: string | null; role: string; level: string; duration_seconds: number; mode: string;
  status: InterviewStatus; plan: Plan | null; prompt_version: string; rubric_version: string; models: Record<string, string>;
  slot_source: SlotSource | null; started_at: Date | null; ends_at: Date | null; expire_at: Date | null; created_at: Date;
  turns: Turn[]; turn_count: number; ended_at: Date | null; end_reason: EndReason | null;
};
export type NewInterview = Omit<InterviewDoc, "id" | "status" | "plan" | "slot_source" | "started_at" | "ends_at" | "turns" | "turn_count" | "ended_at" | "end_reason">;

export interface InterviewsStore {
  appendTurn(userId: string, id: string, expectedSeq: number, turn: Turn, clientTurnId: string | null): Promise<boolean>;
  markWrappingUp(userId: string, id: string): Promise<void>;
  complete(userId: string, id: string, reason: EndReason, endedAt: Date): Promise<void>;
  insert(doc: NewInterview): Promise<string>;
  findOwned(userId: string, id: string): Promise<InterviewDoc | null>;
  setPlan(userId: string, id: string, plan: Plan): Promise<boolean>; // created -> plan_ready
  markFailed(userId: string, id: string): Promise<void>;
  start(userId: string, id: string, data: { started_at: Date; ends_at: Date; slot_source: SlotSource }): Promise<InterviewDoc | null>; // plan_ready -> in_progress
}
export interface UsersStore {
  ensureUser(userId: string): Promise<void>;
  reserveSlot(userId: string, freeLimit: number): Promise<SlotSource | null>;
  refundSlot(userId: string, source: SlotSource): Promise<void>;
}

const oid = (id: string) => (ObjectId.isValid(id) ? new ObjectId(id) : null);
function toDoc(raw: Document): InterviewDoc {
  const { _id, profile_id, ...rest } = raw;
  return { ...rest, id: _id.toString(), profile_id: profile_id ? String(profile_id) : null } as InterviewDoc;
}

export function createMongoInterviewsStore(): InterviewsStore {
  const col = async () => (await getDb()).collection(COLLECTIONS.interviews);
  return {
    async insert(doc) {
      const profileId = doc.profile_id ? oid(doc.profile_id) : null;
      const r = await (await col()).insertOne({
        ...doc, profile_id: profileId, status: "created", plan: null, slot_source: null, started_at: null, ends_at: null,
        ended_at: null, end_reason: null, turn_count: 0, turns: [],
        usage_totals: { llm_input_tokens: 0, llm_output_tokens: 0, stt_seconds: 0, tts_characters: 0, est_cost_usd: 0 },
      });
      return r.insertedId.toString();
    },
    async findOwned(userId, id) {
      const _id = oid(id);
      const d = _id ? await (await col()).findOne({ _id, user_id: userId, $or: [{ expire_at: null }, { expire_at: { $gt: new Date() } }] }) : null;
      return d ? toDoc(d) : null;
    },
    async setPlan(userId, id, plan) {
      const _id = oid(id);
      if (!_id) return false;
      const r = await (await col()).updateOne({ _id, user_id: userId, status: "created" }, { $set: { plan, status: "plan_ready" } });
      return r.modifiedCount === 1;
    },
    async markFailed(userId, id) {
      const _id = oid(id);
      if (_id) await (await col()).updateOne({ _id, user_id: userId, status: { $in: ["created", "plan_ready"] } }, { $set: { status: "failed", end_reason: "error" } });
    },
    async start(userId, id, data) {
      const _id = oid(id);
      if (!_id) return null;
      const d = await (await col()).findOneAndUpdate(
        { _id, user_id: userId, status: "plan_ready" },
        { $set: { status: "in_progress", ...data, expire_at: interviewExpiry(data.ends_at) } },
        { returnDocument: "after" },
      );
      return d ? toDoc(d) : null;
    },
    // Optimistic concurrency (turn_count must equal expectedSeq) plus idempotency on client_turn_id.
    async appendTurn(userId, id, expectedSeq, turn, clientTurnId) {
      const _id = oid(id);
      if (!_id) return false;
      const filter: Document = { _id, user_id: userId, status: { $in: ["in_progress", "wrapping_up"] }, turn_count: expectedSeq };
      if (clientTurnId) filter["turns.client_turn_id"] = { $ne: clientTurnId };
      const r = await (await col()).updateOne(filter, { $push: { turns: turn }, $inc: { turn_count: 1 } } as unknown as UpdateFilter<Document>);
      return r.modifiedCount === 1;
    },
    async markWrappingUp(userId, id) {
      const _id = oid(id);
      if (_id) await (await col()).updateOne({ _id, user_id: userId, status: "in_progress" }, { $set: { status: "wrapping_up" } });
    },
    async complete(userId, id, reason, endedAt) {
      const _id = oid(id);
      if (_id) await (await col()).updateOne({ _id, user_id: userId, status: { $in: ["in_progress", "wrapping_up"] } }, { $set: { status: "completed", end_reason: reason, ended_at: endedAt, expire_at: interviewExpiry(endedAt) } });
    },
  };
}

export function createMongoUsersStore(): UsersStore {
  const col = async () => (await getDb()).collection<{ _id: string } & Document>(COLLECTIONS.app_users);
  return {
    async ensureUser(userId) {
      try {
        await (await col()).updateOne(
          { _id: userId },
          { $setOnInsert: { display_name: null, free_interviews_used: 0, paid_interview_credits: 0, consents: [], created_at: new Date() } },
          { upsert: true },
        );
      } catch (err) {
        if ((err as { code?: number }).code !== 11000) throw err; // concurrent first request: user already exists
      }
    },
    // Each step is a single atomic update, so two requests can never take the same last slot.
    async reserveSlot(userId, freeLimit) {
      const c = await col();
      if (await c.findOneAndUpdate({ _id: userId, free_interviews_used: { $lt: freeLimit } }, { $inc: { free_interviews_used: 1 } })) return "free";
      if (await c.findOneAndUpdate({ _id: userId, paid_interview_credits: { $gt: 0 } }, { $inc: { paid_interview_credits: -1 } })) return "paid";
      return null;
    },
    async refundSlot(userId, source) {
      await (await col()).updateOne({ _id: userId }, { $inc: source === "free" ? { free_interviews_used: -1 } : { paid_interview_credits: 1 } });
    },
  };
}
