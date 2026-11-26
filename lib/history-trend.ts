import type { Dimension } from "./report-schema";

type HistoryScoreRow = {
  id: string;
  role: string;
  created_at: Date;
  scores: Partial<Record<Dimension, number | null>> | null;
};

export function historyTrendRows(items: readonly HistoryScoreRow[]) {
  return items.flatMap(item => item.scores ? [{
    id: item.id, role: item.role, date: item.created_at.toISOString(), scores: item.scores,
  }] : []).reverse();
}

export function historyScoreSeries(rows: ReturnType<typeof historyTrendRows>, dimension: Dimension) {
  const points = rows.map(row => ({ ...row, score: row.scores[dimension] ?? null }));
  const scored = points.filter(point => point.score !== null);
  const latest = scored.at(-1);
  const prior = scored.at(-2);
  return {
    points,
    latest,
    change: latest?.score != null && prior?.score != null ? latest.score - prior.score : null,
  };
}
