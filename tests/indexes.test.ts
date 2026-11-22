import { describe, expect, it } from "vitest";
import { INDEXES } from "@/lib/indexes";
import { COLLECTIONS } from "@/lib/db";

describe("index definitions", () => {
  it("only reference known collections", () => {
    for (const def of INDEXES) expect(Object.values(COLLECTIONS)).toContain(def.collection);
  });

  it("has no duplicate index keys", () => {
    const seen = new Set(INDEXES.map((d) => `${d.collection}:${JSON.stringify(d.key)}`));
    expect(seen.size).toBe(INDEXES.length);
  });

  it("makes reports unique per interview", () => {
    const def = INDEXES.find((d) => d.collection === "reports" && "interview_id" in (d.key as object));
    expect(def?.options?.unique).toBe(true);
  });

  it("expires unstarted interviews, usage events, and rate limit counters", () => {
    const ttl = INDEXES.filter((d) => d.options?.expireAfterSeconds !== undefined).map((d) => d.collection);
    expect(ttl).toEqual(["interviews", "usage_events", "rate_limit_counters"]);
    const usage = INDEXES.find((d) => d.collection === "usage_events" && d.options?.expireAfterSeconds);
    expect(usage?.options?.expireAfterSeconds).toBe(7776000);
  });
});
