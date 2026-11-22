import { ObjectId, type Document } from "mongodb";
import { COLLECTIONS, getClientPromise, getDb } from "./db";
import type { Dimension, Report } from "./report-schema";

export type ReportStatus = "pending" | "ready" | "failed";
export type ReportDoc = {
  id: string; interview_id: string; user_id: string; status: ReportStatus; rubric_version: string | null; summary: string | null;
  scores: Record<Dimension, number | null> | null; details: Report | null; attempts: number; error_code: string | null;
  model: string | null; created_at: Date; updated_at: Date;
};

export interface ReportsStore {
  findByInterview(userId: string, interviewId: string): Promise<ReportDoc | null>;
  /** Claims generation for an interview that has no report yet. False means a report row already exists. */
  createPending(userId: string, interviewId: string): Promise<boolean>;
  /** Claims a retry: a failed report (fromFailed) or a pending one that went stale. */
  claimRetry(userId: string, interviewId: string, o: { fromFailed: boolean; staleBefore: Date; maxAttempts: number }): Promise<boolean>;
  markReady(userId: string, interviewId: string, data: { report: Report; model: string }): Promise<void>;
  markFailed(userId: string, interviewId: string, errorCode: string): Promise<void>;
}

const oid = (id: string) => (ObjectId.isValid(id) ? new ObjectId(id) : null);
function toDoc(raw: Document): ReportDoc {
  const { _id, interview_id, ...rest } = raw;
  return { ...rest, id: _id.toString(), interview_id: String(interview_id) } as ReportDoc;
}

export function createMongoReportsStore(): ReportsStore {
  const col = async () => (await getDb()).collection(COLLECTIONS.reports);
  return {
    async findByInterview(userId, interviewId) {
      const interview_id = oid(interviewId);
      const d = interview_id ? await (await col()).findOne({ interview_id, user_id: userId }) : null;
      return d ? toDoc(d) : null;
    },
    async createPending(userId, interviewId) {
      const interview_id = oid(interviewId);
      if (!interview_id) return false;
      const now = new Date();
      const db = await getDb();
      const client = await getClientPromise();
      try {
        return await client.withSession(session => session.withTransaction(async () => {
          // Write to the parent so report creation and interview deletion cannot commit past each other.
          const interview = await db.collection(COLLECTIONS.interviews).findOneAndUpdate(
            { _id: interview_id, user_id: userId, status: "completed", expire_at: { $gt: now } },
            { $inc: { report_creation_revision: 1 } },
            { session, projection: { expire_at: 1 } },
          );
          if (!interview) return false;
          await db.collection(COLLECTIONS.reports).insertOne({
            interview_id, user_id: userId, status: "pending", attempts: 1, error_code: null,
            rubric_version: null, summary: null, scores: null, details: null, model: null,
            created_at: now, updated_at: now, expire_at: interview.expire_at,
          }, { session });
          return true;
        }));
      } catch (err) {
        if ((err as { code?: number }).code === 11000) return false; // unique index on interview_id: someone else claimed it
        throw err;
      }
    },
    async claimRetry(userId, interviewId, o) {
      const interview_id = oid(interviewId);
      if (!interview_id) return false;
      const filter: Document = o.fromFailed
        ? { interview_id, user_id: userId, status: "failed", error_code: { $ne: "not_enough_answers" }, attempts: { $lt: o.maxAttempts } }
        : { interview_id, user_id: userId, status: "pending", updated_at: { $lt: o.staleBefore }, attempts: { $lt: o.maxAttempts } };
      const r = await (await col()).updateOne(filter, { $set: { status: "pending", error_code: null, updated_at: new Date() }, $inc: { attempts: 1 } });
      return r.modifiedCount === 1;
    },
    async markReady(userId, interviewId, { report, model }) {
      const interview_id = oid(interviewId);
      if (!interview_id) return;
      const scores = Object.fromEntries(Object.entries(report.scores).map(([k, v]) => [k, v.score]));
      await (await col()).updateOne({ interview_id, user_id: userId }, { $set: { status: "ready", rubric_version: report.rubric_version, summary: report.summary, scores, details: report, error_code: null, model, updated_at: new Date() } });
    },
    async markFailed(userId, interviewId, errorCode) {
      const interview_id = oid(interviewId);
      if (interview_id) await (await col()).updateOne({ interview_id, user_id: userId }, { $set: { status: "failed", error_code: errorCode, updated_at: new Date() } });
    },
  };
}
