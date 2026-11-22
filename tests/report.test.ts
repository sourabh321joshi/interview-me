import { describe, expect, it } from "vitest";
import type { Turn } from "@/lib/interviews-store";
import { buildReportSchema } from "@/lib/report-schema";
import { endInterview, generateReport, getReport, regenerateReport, STALE_PENDING_MS, type ReportDeps } from "@/lib/report-service";
import { fakeLlm } from "./helpers/fake-llm";
import { memoryReports } from "./helpers/memory-reports";
import { startedInterview, T0 } from "./helpers/turn-setup";

const A1 = "I used Socket.IO because it handles reconnection for me";
const A2 = "A closure remembers variables from its outer scope";
const dim = (score: number | null, quote?: string) => ({ score, rationale: "ok", evidence: quote ? [{ quote, note: "n" }] : [] });
const report = (o: object = {}) => ({
  summary: "Good.",
  scores: { problem_solving: dim(3, "I used Socket.IO because it handles reconnection"), technical_depth: dim(3, "it handles reconnection for me"), fundamentals: dim(null), communication: dim(4, "A closure remembers variables") },
  strengths: ["Clear"],
  top_fixes: [1, 2, 3].map(() => ({ title: "t", why_it_matters: "w", evidence_quote: A2, how_to_improve: "h" })),
  suggested_practice: ["p"], limitations: "short", ...o,
});
const J = (o?: object) => JSON.stringify(report(o));

async function setup(script: string[], answers = [A1, A2]) {
  const s = await startedInterview([]);
  const doc = s.interviews.docs.get(s.id)!;
  const turns: Turn[] = [];
  for (const a of answers) {
    turns.push({ seq: turns.length, speaker: "interviewer", kind: "text", text: "Question?", t_offset_ms: 0, client_turn_id: null, created_at: T0 });
    turns.push({ seq: turns.length, speaker: "candidate", kind: "text", text: a, t_offset_ms: 1000, client_turn_id: crypto.randomUUID(), created_at: T0 });
  }
  Object.assign(doc, { turns, turn_count: turns.length, status: "completed", end_reason: "model_finished" });
  const reports = memoryReports(() => s.clock.t);
  const { llm, calls } = fakeLlm(script);
  const deps: ReportDeps = { interviews: s.interviews, reports, llm, model: () => "report-model", now: () => s.clock.t };
  return { ...s, reports, deps, calls };
}

describe("generateReport", () => {
  it("saves a ready report and copies scores, keeping null", async () => {
    const { id, deps, reports } = await setup([J()]);
    await endInterview("u1", id, deps);
    await generateReport("u1", id, deps);
    expect(reports.docs.get(id)).toMatchObject({ status: "ready", rubric_version: "0.1", model: "report-model", scores: { problem_solving: 3, technical_depth: 3, fundamentals: null, communication: 4 } });
  });

  it("retries once when a quote is not in the transcript, telling the model why", async () => {
    const bad = J({ top_fixes: [1, 2, 3].map(() => ({ title: "t", why_it_matters: "w", evidence_quote: "I never said this sentence", how_to_improve: "h" })) });
    const { id, deps, reports, calls } = await setup([bad, J()]);
    await endInterview("u1", id, deps);
    await generateReport("u1", id, deps);
    expect(calls).toHaveLength(2);
    expect(calls[1].messages.at(-1)!.content).toContain("Quote not found");
    expect(reports.docs.get(id)!.status).toBe("ready");
  });

  it("marks the report failed when the quotes stay wrong", async () => {
    const bad = J({ summary: "x", top_fixes: [1, 2, 3].map(() => ({ title: "t", why_it_matters: "w", evidence_quote: "invented quote text", how_to_improve: "h" })) });
    const { id, deps, reports } = await setup([bad, bad]);
    await endInterview("u1", id, deps);
    await generateReport("u1", id, deps);
    expect(reports.docs.get(id)).toMatchObject({ status: "failed", error_code: "invalid_output" });
    expect(await getReport("u1", id, deps)).toMatchObject({ status: "failed", can_regenerate: true });
  });

  it("does not call the model when there are too few answers", async () => {
    const { id, deps, reports, calls } = await setup([], [A1]);
    await endInterview("u1", id, deps);
    await generateReport("u1", id, deps);
    expect(calls).toHaveLength(0);
    expect(reports.docs.get(id)).toMatchObject({ status: "failed", error_code: "not_enough_answers" });
    expect(await getReport("u1", id, deps)).toMatchObject({ status: "failed", can_regenerate: false });
    await expect(regenerateReport("u1", id, deps)).rejects.toMatchObject({ code: "validation_failed" });
  });
});

describe("quote validation", () => {
  const schema = buildReportSchema([A1, A2]);
  it("accepts quotes with different spacing or wrapping quote marks, from candidate answers only", () => {
    const ok = report({ top_fixes: [1, 2, 3].map(() => ({ title: "t", why_it_matters: "w", evidence_quote: `“A  closure remembers\nvariables”`, how_to_improve: "h" })) });
    expect(schema.safeParse(ok).success).toBe(true);
    const fromInterviewer = report({ top_fixes: [1, 2, 3].map(() => ({ title: "t", why_it_matters: "w", evidence_quote: "Question?", how_to_improve: "h" })) });
    expect(schema.safeParse(fromInterviewer).success).toBe(false);
  });
  it("needs evidence for a score, but allows null without it", () => {
    expect(schema.safeParse(report()).success).toBe(true);
    const bad = report({ scores: { ...report().scores, communication: dim(4) } });
    expect(schema.safeParse(bad).success).toBe(false);
  });
  it("needs exactly three fixes", () => {
    expect(schema.safeParse(report({ top_fixes: [] })).success).toBe(false);
  });
});

describe("ending and reading reports", () => {
  it("ends a running interview once and claims generation once", async () => {
    const s = await startedInterview([]);
    const deps: ReportDeps = { interviews: s.interviews, reports: memoryReports(() => s.clock.t), llm: fakeLlm([]).llm, model: () => "m", now: () => s.clock.t };
    expect(await endInterview("u1", s.id, deps)).toMatchObject({ shouldGenerate: true, report_status: "pending" });
    expect(s.interviews.docs.get(s.id)).toMatchObject({ status: "completed", end_reason: "user_ended" });
    expect(await endInterview("u1", s.id, deps)).toMatchObject({ shouldGenerate: false });
    await expect(endInterview("u2", s.id, deps)).rejects.toMatchObject({ code: "not_found" });
    s.interviews.docs.get(s.id)!.status = "plan_ready";
    await expect(endInterview("u1", s.id, deps)).rejects.toMatchObject({ code: "interview_not_active" });
  });

  it("starts generation lazily, then serves the ready report, and hides it from other users", async () => {
    const { id, deps } = await setup([J()]);
    expect(await getReport("u1", id, deps)).toEqual({ status: "pending", shouldGenerate: true });
    await generateReport("u1", id, deps);
    expect(await getReport("u1", id, deps)).toMatchObject({ status: "ready", shouldGenerate: false });
    await expect(getReport("u2", id, deps)).rejects.toMatchObject({ code: "not_found" });
  });

  it("refuses a report while the interview is still running", async () => {
    const s = await startedInterview([]);
    const deps: ReportDeps = { interviews: s.interviews, reports: memoryReports(), llm: fakeLlm([]).llm, model: () => "m", now: () => s.clock.t };
    await expect(getReport("u1", s.id, deps)).rejects.toMatchObject({ code: "interview_not_active" });
  });

  it("restarts a pending report only once it has gone stale", async () => {
    const { id, deps, clock } = await setup([]);
    await endInterview("u1", id, deps);
    expect((await getReport("u1", id, deps)).shouldGenerate).toBe(false);
    clock.t = new Date(clock.t.getTime() + STALE_PENDING_MS + 1000);
    expect((await getReport("u1", id, deps)).shouldGenerate).toBe(true);
    expect((await getReport("u1", id, deps)).shouldGenerate).toBe(false); // already claimed again
  });
});

describe("regeneration limits", () => {
  it("allows 3 regenerations after the first attempt, then stops", async () => {
    const { id, deps, reports } = await setup(Array(40).fill("{}"));
    await endInterview("u1", id, deps);
    await generateReport("u1", id, deps);
    for (let i = 0; i < 3; i++) {
      expect(await regenerateReport("u1", id, deps)).toEqual({ shouldGenerate: true });
      await generateReport("u1", id, deps);
    }
    expect(reports.docs.get(id)!.attempts).toBe(4);
    await expect(regenerateReport("u1", id, deps)).rejects.toMatchObject({ code: "rate_limited" });
    expect(await getReport("u1", id, deps)).toMatchObject({ status: "failed", can_regenerate: false });
  });
  it("only regenerates failed reports", async () => {
    const { id, deps } = await setup([J()]);
    await endInterview("u1", id, deps);
    await generateReport("u1", id, deps);
    await expect(regenerateReport("u1", id, deps)).rejects.toMatchObject({ code: "interview_not_active" });
  });
});
