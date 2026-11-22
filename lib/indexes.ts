import type { CreateIndexesOptions, IndexSpecification } from "mongodb";

export type IndexDef = {
  collection: string;
  key: IndexSpecification;
  options?: CreateIndexesOptions;
};

const NINETY_DAYS = 60 * 60 * 24 * 90;

// Mirrors database-design-v0.2.md, section 3.
export const INDEXES: IndexDef[] = [
  { collection: "candidate_profiles", key: { user_id: 1, created_at: -1 } },
  { collection: "interviews", key: { user_id: 1, created_at: -1 } },
  { collection: "interviews", key: { status: 1, ends_at: 1 } },
  { collection: "interviews", key: { expire_at: 1 }, options: { expireAfterSeconds: 0 } },
  { collection: "reports", key: { expire_at: 1 }, options: { expireAfterSeconds: 0 } },
  { collection: "reports", key: { interview_id: 1 }, options: { unique: true } },
  { collection: "reports", key: { user_id: 1, created_at: -1 } },
  { collection: "usage_events", key: { interview_id: 1 } },
  { collection: "usage_events", key: { created_at: 1 }, options: { expireAfterSeconds: NINETY_DAYS } },
  { collection: "rate_limit_counters", key: { expire_at: 1 }, options: { expireAfterSeconds: 0 } },
];
