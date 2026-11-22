import { ObjectId, type Filter } from "mongodb";
import { z } from "zod";
import { COLLECTIONS, getDb } from "./db";
import type { InterviewStatus } from "./interviews-store";
import type { ReportDoc } from "./reports-store";

export const HistoryQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z_[a-f0-9]{24}$/).refine(
    value => !Number.isNaN(Date.parse(value.slice(0, 24))),
  ).optional(),
});

type HistoryRow = {
  _id: ObjectId; user_id: string; created_at: Date; expire_at: Date | null;
  role: string; level: string; duration_seconds: number; status: InterviewStatus;
};

export async function listInterviewHistory(userId: string, query: z.infer<typeof HistoryQuery>) {
  const db = await getDb();
  const conditions: Filter<HistoryRow>[] = [{ $or: [{ expire_at: null }, { expire_at: { $gt: new Date() } }] }];
  if (query.cursor) {
    const created_at = new Date(query.cursor.slice(0, 24));
    const _id = new ObjectId(query.cursor.slice(25));
    conditions.push({ $or: [{ created_at: { $lt: created_at } }, { created_at, _id: { $lt: _id } }] });
  }

  const rows = await db.collection<HistoryRow>(COLLECTIONS.interviews)
    .find({ user_id: userId, $and: conditions }, { projection: { created_at: 1, role: 1, level: 1, duration_seconds: 1, status: 1 } })
    .sort({ created_at: -1, _id: -1 }).limit(query.limit + 1).toArray();
  const hasMore = rows.length > query.limit;
  const page = rows.slice(0, query.limit);
  const reports = page.length ? await db.collection<{ interview_id: ObjectId; scores: ReportDoc["scores"] }>(COLLECTIONS.reports).find(
    { user_id: userId, interview_id: { $in: page.map(row => row._id) }, status: "ready" },
    { projection: { interview_id: 1, scores: 1 } },
  ).toArray() : [];
  const scoresById = new Map(reports.map(report => [report.interview_id.toHexString(), report.scores]));
  const last = page.at(-1);

  return {
    items: page.map(({ _id, created_at, role, level, duration_seconds, status }) => ({
      id: _id.toHexString(), created_at, role, level, duration_seconds, status,
      scores: scoresById.get(_id.toHexString()) ?? null,
    })),
    next_cursor: hasMore && last ? `${last.created_at.toISOString()}_${last._id.toHexString()}` : null,
  };
}
