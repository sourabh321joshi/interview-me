import type { ApiErrorCode } from "./api-error";
import { CreateInterviewSchema, LlmPlanSchema, timeBudget, type CreateInterviewInput, type Plan } from "./interview-schemas";
import { canTransition } from "./interview-state";
import type { InterviewDoc, InterviewsStore, UsersStore } from "./interviews-store";
import type { CallContext } from "./llm";
import { loadPrompt, PROMPT_VERSION, wrapData } from "./prompts";
import type { ProfilesStore } from "./profiles-store";
import type { ZodType } from "zod";

export class DomainError extends Error {
  constructor(public code: ApiErrorCode, message: string) { super(message); }
}
type Llm = { generateJson: <T>(role: "plan", schema: ZodType<T>, input: { system: string; messages: { role: "user"; content: string }[]; ctx?: CallContext }) => Promise<T> };
export type InterviewDeps = {
  interviews: InterviewsStore; users: UsersStore; profiles: ProfilesStore; llm: Llm;
  models: () => Record<string, string>; freeLimit: number; now?: () => Date;
};
const DAY_MS = 86_400_000;
export const RUBRIC_VERSION = "0.1";

export async function createInterview(userId: string, raw: unknown, deps: InterviewDeps): Promise<InterviewDoc> {
  const parsed = CreateInterviewSchema.safeParse(raw);
  if (!parsed.success) throw new DomainError("validation_failed", "Invalid interview settings.");
  const input: CreateInterviewInput = parsed.data;

  const profile = await deps.profiles.findOwned(userId, input.profile_id);
  if (!profile) throw new DomainError("not_found", "Profile not found.");
  if (profile.status !== "ready" || !profile.summary) throw new DomainError("profile_not_ready", "Your profile is not ready yet.");

  const models = deps.models(); // fails early on missing config, before anything is saved
  const now = deps.now?.() ?? new Date();
  const id = await deps.interviews.insert({
    user_id: userId, profile_id: profile.id, role: input.role, level: input.level, duration_seconds: input.duration_seconds,
    mode: input.mode, prompt_version: PROMPT_VERSION, rubric_version: RUBRIC_VERSION, models,
    expire_at: new Date(now.getTime() + 30 * DAY_MS), created_at: now,
  });

  try {
    const data = JSON.stringify({ summary: profile.summary, github_repos: profile.github_summary?.repos ?? [] });
    const parts = [
      `Role and level: ${input.role}, ${input.level}`,
      `Duration: ${input.duration_seconds / 60} minutes`,
      wrapData("candidate_profile", data),
      ...(profile.job_description ? [wrapData("job_description", profile.job_description)] : []),
    ];
    const llmPlan = await deps.llm.generateJson("plan", LlmPlanSchema, {
      system: loadPrompt("plan"), messages: [{ role: "user", content: parts.join("\n\n") }], ctx: { user_id: userId, interview_id: id },
    });
    const plan: Plan = { ...llmPlan, schema_version: 1, time_budget_seconds: timeBudget(input.duration_seconds) };
    if (!(await deps.interviews.setPlan(userId, id, plan))) throw new DomainError("internal", "Could not save the plan.");
  } catch (err) {
    await deps.interviews.markFailed(userId, id);
    throw err;
  }
  return (await deps.interviews.findOwned(userId, id))!;
}

export async function startInterview(userId: string, id: string, deps: InterviewDeps): Promise<InterviewDoc> {
  const iv = await deps.interviews.findOwned(userId, id);
  if (!iv) throw new DomainError("not_found", "Interview not found.");
  if (!canTransition(iv.status, "in_progress")) throw new DomainError("interview_not_active", "This interview can't be started.");

  await deps.users.ensureUser(userId);
  const source = await deps.users.reserveSlot(userId, deps.freeLimit);
  if (!source) throw new DomainError("quota_exceeded", "You have no interviews left.");

  const startedAt = deps.now?.() ?? new Date();
  const started = await deps.interviews.start(userId, id, {
    started_at: startedAt, ends_at: new Date(startedAt.getTime() + iv.duration_seconds * 1000), slot_source: source,
  });
  if (!started) {
    await deps.users.refundSlot(userId, source); // lost a race or the state changed: give the slot back
    throw new DomainError("interview_not_active", "This interview can't be started.");
  }
  return started;
}
