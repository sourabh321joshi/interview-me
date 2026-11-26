import { describe, expect, it } from "vitest";
import { historyScoreSeries, historyTrendRows } from "@/lib/history-trend";

describe("history trends", () => {
  it("uses visible ready reports in chronological order and keeps unscored dimensions visible", () => {
    const rows = historyTrendRows([
      { id: "latest", role: "frontend", created_at: new Date("2026-11-26"), scores: { problem_solving: 4 } },
      { id: "pending", role: "frontend", created_at: new Date("2026-11-25"), scores: null },
      { id: "unscored", role: "backend", created_at: new Date("2026-11-24"), scores: { problem_solving: null, fundamentals: 2 } },
      { id: "first", role: "frontend", created_at: new Date("2026-11-23"), scores: { problem_solving: 3 } },
    ]);
    const series = historyScoreSeries(rows, "problem_solving");
    expect(series.points.map(({ id, score }) => [id, score])).toEqual([
      ["first", 3], ["unscored", null], ["latest", 4],
    ]);
    expect(series.latest?.id).toBe("latest");
    expect(series.change).toBe(1);
    expect(historyScoreSeries(rows, "fundamentals")).toMatchObject({ latest: { id: "unscored", score: 2 }, change: null });
    expect(historyScoreSeries(rows, "communication").latest).toBeUndefined();
  });
});
