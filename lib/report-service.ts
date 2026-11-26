import type { ZodType } from "zod";
import { DomainError, RUBRIC_VERSION } from "./interview-service";
import type { InterviewsStore, Turn } from "./interviews-store";
import { LlmError, type CallContext } from "./llm";
import { loadPrompt, wrapData } from "./prompts";
import { buildReportSchema, type Report } from "./report-schema";
import type { ReportDoc, ReportsStore } from "./reports-store";
import { getInterviewView } from "./turn-service";

export const MAX_ATTEMPTS = 4; // the first generation plus 3 regenerations
export const STALE_PENDING_MS = 120_000;
export const MIN_ANSWERS = 2;

type ReportLlm = { generateJson: <T>(role: "report", schema: ZodType<T>, input: { system: string; messages: { role: "user"; content: string }[]; ctx?: CallContext }) => Promise<T> };
export type ReportDeps = { interviews: InterviewsStore; reports: ReportsStore; llm: ReportLlm; model: () => string; now?: () => Date };
export type ReportAction = { shouldGenerate: boolean };

const isAnswer = (t: Turn) => t.speaker === "candidate" && t.kind !== "system";
const transcriptText = (turns: Turn[]) => turns.map((t) => (t.speaker === "interviewer" ? `Interviewer: ${t.text}` : t.kind === "system" ? "Candidate: [silent]" : `Candidate: ${t.text}`)).join("\n");

// Ends a running interview (idempotent) and claims report generation once.
export async function endInterview(userId: string, id: string, deps: ReportDeps): Promise<ReportAction & { report_status: string }> {
  const iv = await deps.interviews.findOwned(userId, id);
  if (!iv) throw new DomainError("not_found", "Interview not found.");
  if (iv.status === "in_progress" || iv.status === "wrapping_up") await deps.interviews.complete(userId, id, "user_ended", deps.now?.() ?? new Date());
  else if (iv.status !== "completed") throw new DomainError("interview_not_active", "This interview was never started.");
  const created = await deps.reports.createPending(userId, id);
  const existing = created ? null : await deps.reports.findByInterview(userId, id);
  return { shouldGenerate: created, report_status: existing?.status ?? "pending" };
}

export type ReportResult =
  | ({ status: "ready"; report: Report } & ReportAction)
  | ({ status: "pending" } & ReportAction)
  | ({ status: "failed"; can_regenerate: boolean } & ReportAction);

export async function getReport(userId: string, id: string, deps: ReportDeps): Promise<ReportResult> {
  const view = await getInterviewView(userId, id, { interviews: deps.interviews, now: deps.now }); // also closes expired interviews
  if (view.status !== "completed") throw new DomainError("interview_not_active", "The interview is still running.");
  let r = await deps.reports.findByInterview(userId, id);
  if (!r) {
    // Heals a missed generation: completed interview, no report yet.
    if (await deps.reports.createPending(userId, id)) return { status: "pending", shouldGenerate: true };
    r = await deps.reports.findByInterview(userId, id);
  }
  if (!r) return { status: "pending", shouldGenerate: false };
  if (r.status === "ready" && r.details) return { status: "ready", report: r.details, shouldGenerate: false };
  if (r.status === "failed") return { status: "failed", can_regenerate: canRegenerate(r), shouldGenerate: false };
  const now = deps.now?.() ?? new Date();
  const stale = await deps.reports.claimRetry(userId, id, { fromFailed: false, staleBefore: new Date(now.getTime() - STALE_PENDING_MS), maxAttempts: MAX_ATTEMPTS });
  return { status: "pending", shouldGenerate: stale };
}

const canRegenerate = (r: ReportDoc) => r.error_code !== "not_enough_answers" && r.attempts < MAX_ATTEMPTS;

export async function regenerateReport(userId: string, id: string, deps: ReportDeps): Promise<ReportAction> {
  const iv = await deps.interviews.findOwned(userId, id);
  const r = iv ? await deps.reports.findByInterview(userId, id) : null;
  if (!iv || !r) throw new DomainError("not_found", "Report not found.");
  if (r.status !== "failed") throw new DomainError("interview_not_active", "Only a failed report can be regenerated.");
  if (r.error_code === "not_enough_answers") throw new DomainError("validation_failed", "There were not enough answers to evaluate.");
  if (r.attempts >= MAX_ATTEMPTS) throw new DomainError("rate_limited", "The regeneration limit has been reached.");
  const claimed = await deps.reports.claimRetry(userId, id, { fromFailed: true, staleBefore: new Date(0), maxAttempts: MAX_ATTEMPTS });
  return { shouldGenerate: claimed };
}

// Runs after the response is sent. Never throws for model problems: failures are saved on the report.
export async function generateReport(userId: string, id: string, deps: ReportDeps): Promise<void> {
  const iv = await deps.interviews.findOwned(userId, id);
  if (!iv || iv.status !== "completed") return;
  const answers = iv.turns.filter(isAnswer);
  if (answers.length < MIN_ANSWERS) return deps.reports.markFailed(userId, id, "not_enough_answers");
  try {
    const submission = answers.findLast(turn => turn.kind === "code");
    let system = loadPrompt("report", { role_and_level: `${iv.role}, ${iv.level}`, transcript: wrapData("transcript", transcriptText(iv.turns)) });
    if (submission) {
      system += "\n\n" + loadPrompt("report-coding", {
        source: wrapData("latest_source", submission.text),
        output: submission.output ? wrapData("candidate_output", submission.output) : "",
      });
    }
    const out = await deps.llm.generateJson("report", buildReportSchema(answers.map((t) => t.text), submission?.text), {
      system, messages: [{ role: "user", content: "Evaluate the interview and return the report JSON now." }], ctx: { user_id: userId, interview_id: id },
    });
    await deps.reports.markReady(userId, id, { report: { ...out, rubric_version: RUBRIC_VERSION }, model: deps.model() });
  } catch (err) {
    await deps.reports.markFailed(userId, id, err instanceof LlmError ? err.code : "internal");
  }
}
