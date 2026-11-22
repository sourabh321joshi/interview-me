import { describe, expect, it } from "vitest";
import { HistoryQuery } from "@/lib/history";

describe("history query", () => {
  it("defaults to twenty results and rejects invalid limits", () => {
    expect(HistoryQuery.parse({})).toEqual({ limit: 20 });
    for (const limit of ["0", "101", "1.5"]) {
      expect(HistoryQuery.safeParse({ limit }).success).toBe(false);
    }
  });

  it("requires a timestamp and object id in a cursor", () => {
    const id = "6650a1b2c3d4e5f6a7b8c9d0";
    const cursor = `2026-11-14T10:00:00.000Z_${id}`;
    expect(HistoryQuery.parse({ cursor }).cursor).toBe(cursor);
    expect(HistoryQuery.safeParse({ cursor: id }).success).toBe(false);
    expect(HistoryQuery.safeParse({ cursor: cursor.replace("-11-", "-99-") }).success).toBe(false);
  });
});
