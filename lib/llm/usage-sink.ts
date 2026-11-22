import { ObjectId } from "mongodb";
import { COLLECTIONS, getDb } from "@/lib/db";
import type { UsageEvent, UsageSink } from "./types";

export function buildUsageInc(e: UsageEvent) {
  return {
    "usage_totals.llm_input_tokens": e.input_tokens,
    "usage_totals.llm_output_tokens": e.output_tokens,
    "usage_totals.est_cost_usd": e.est_cost_usd,
  };
}

export function createMongoUsageSink(): UsageSink {
  return {
    async record(e) {
      const db = await getDb();
      const interviewId = e.interview_id && ObjectId.isValid(e.interview_id) ? new ObjectId(e.interview_id) : null;
      await db.collection(COLLECTIONS.usage_events).insertOne({
        user_id: e.user_id ?? null,
        interview_id: interviewId,
        provider: e.provider,
        kind: "llm",
        role: e.role,
        model: e.model,
        input_tokens: e.input_tokens,
        output_tokens: e.output_tokens,
        cached_input_tokens: e.cached_input_tokens,
        latency_ms: e.latency_ms,
        est_cost_usd: e.est_cost_usd,
        created_at: new Date(),
      });
      if (interviewId) {
        await db.collection(COLLECTIONS.interviews).updateOne({ _id: interviewId, ...(e.user_id ? { user_id: e.user_id } : {}) }, { $inc: buildUsageInc(e) });
      }
    },
  };
}
