import type { ReportDoc, ReportsStore } from "@/lib/reports-store";

export function memoryReports(now: () => Date = () => new Date()): ReportsStore & { docs: Map<string, ReportDoc> } {
  const docs = new Map<string, ReportDoc>(); // keyed by interview id
  const own = (u: string, id: string) => { const d = docs.get(id); return d && d.user_id === u ? d : null; };
  return {
    docs,
    async findByInterview(u, id) { const d = own(u, id); return d ? { ...d } : null; },
    async createPending(u, id) {
      if (docs.has(id)) return false; // like the unique index on interview_id
      docs.set(id, { id: `r${docs.size + 1}`, interview_id: id, user_id: u, status: "pending", rubric_version: null, summary: null, scores: null, details: null, attempts: 1, error_code: null, model: null, created_at: now(), updated_at: now() });
      return true;
    },
    async claimRetry(u, id, o) {
      const d = own(u, id);
      if (!d || d.attempts >= o.maxAttempts) return false;
      const ok = o.fromFailed ? d.status === "failed" && d.error_code !== "not_enough_answers" : d.status === "pending" && d.updated_at < o.staleBefore;
      if (!ok) return false;
      Object.assign(d, { status: "pending", error_code: null, updated_at: now(), attempts: d.attempts + 1 });
      return true;
    },
    async markReady(u, id, { report, model }) {
      const d = own(u, id);
      if (d) Object.assign(d, { status: "ready", details: report, summary: report.summary, rubric_version: report.rubric_version, model, error_code: null, updated_at: now(),
        scores: Object.fromEntries(Object.entries(report.scores).map(([k, v]) => [k, v.score])) as ReportDoc["scores"] });
    },
    async markFailed(u, id, code) { const d = own(u, id); if (d) Object.assign(d, { status: "failed", error_code: code, updated_at: now() }); },
  };
}
