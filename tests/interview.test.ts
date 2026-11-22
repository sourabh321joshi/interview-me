import { describe, expect, it, vi } from "vitest";
import { CreateInterviewSchema, timeBudget } from "@/lib/interview-schemas";
import { createInterview, startInterview, type InterviewDeps } from "@/lib/interview-service";
import { canTransition } from "@/lib/interview-state";
import { LlmError } from "@/lib/llm";
import type { ProfileSummary } from "@/lib/schemas";
import { fakeLlm, SUMMARY } from "./helpers/fake-llm";
import { memoryInterviews, memoryUsers } from "./helpers/memory-interviews";
import { memoryStore } from "./helpers/memory-store";

const NOW = new Date("2026-11-14T10:00:00Z");
const PLAN = JSON.stringify({
  project_to_probe: "TaskFlow", why_this_project: "Most substantial", project_questions: ["q1", "q2", "q3"],
  fundamentals_topics: ["Closures", "Promises"], risks: [], time_budget_seconds: { opening: 1, project: 1, fundamentals: 1, wrapup: 1 },
});
const input = (profile_id: string, extra = {}) => ({ profile_id, role: "frontend", level: "fresher", duration_seconds: 300, ...extra });

async function setup(opts: { freeLimit?: number; paid?: number; llmScript?: Array<string | Error> } = {}) {
  const profiles = memoryStore();
  const pid = await profiles.insert({ user_id: "u1", github_username: null, job_description: null });
  await profiles.markReady("u1", pid, { summary: SUMMARY as unknown as ProfileSummary, github_summary: null });
  const { llm, calls } = fakeLlm(opts.llmScript ?? Array(6).fill(PLAN));
  const interviews = memoryInterviews();
  const users = memoryUsers(opts.paid ?? 0);
  const deps: InterviewDeps = { interviews, users, profiles, llm, models: () => ({ plan: "m", turn: "m", report: "m" }), freeLimit: opts.freeLimit ?? 1, now: () => NOW };
  return { deps, pid, interviews, users, profiles, calls };
}

describe("createInterview", () => {
  it("stores a plan with server-computed pacing and an expiry", async () => {
    const { deps, pid, calls } = await setup();
    const iv = await createInterview("u1", input(pid), deps);
    expect(iv).toMatchObject({ status: "plan_ready", prompt_version: "0.2", models: { plan: "m", turn: "m", report: "m" } });
    expect(iv.plan?.time_budget_seconds).toEqual({ opening: 20, project: 150, fundamentals: 90, wrapup: 30 });
    expect(iv.plan?.project_to_probe).toBe("TaskFlow");
    expect(iv.expire_at?.getTime()).toBe(NOW.getTime() + 30 * 86_400_000);
    expect(calls[0].messages[0].content).toContain('<data label="candidate_profile">');
  });
  it("scales pacing with duration", () => {
    expect(timeBudget(600)).toEqual({ opening: 40, project: 300, fundamentals: 180, wrapup: 60 });
  });
  it("validates settings", () => {
    expect(CreateInterviewSchema.safeParse(input("p", { duration_seconds: 90 })).success).toBe(false);
    expect(CreateInterviewSchema.safeParse(input("p", { role: "designer" })).success).toBe(false);
    expect(CreateInterviewSchema.parse(input("p")).mode).toBe("text");
  });
  it("allows a one-minute smoke test only in development and starts it with a 60-second timer", async () => {
    const settings = (profileId: string) => input(profileId, { duration_seconds: 60 });
    try {
      vi.stubEnv("NODE_ENV", "production");
      expect(CreateInterviewSchema.safeParse(settings("p")).success).toBe(false);
      vi.stubEnv("NODE_ENV", "development");
      const { deps, pid } = await setup();
      const planned = await createInterview("u1", settings(pid), deps);
      const started = await startInterview("u1", planned.id, deps);
      expect(started.ends_at?.getTime()).toBe(NOW.getTime() + 60_000);
      expect(planned.plan?.time_budget_seconds.wrapup).toBe(6);
    } finally {
      vi.unstubAllEnvs();
    }
  });
  it("rejects missing, foreign, and unready profiles", async () => {
    const { deps, pid, profiles } = await setup();
    await expect(createInterview("u1", input("nope"), deps)).rejects.toMatchObject({ code: "not_found" });
    await expect(createInterview("u2", input(pid), deps)).rejects.toMatchObject({ code: "not_found" });
    const pending = await profiles.insert({ user_id: "u1", github_username: null, job_description: null });
    await expect(createInterview("u1", input(pending), deps)).rejects.toMatchObject({ code: "profile_not_ready" });
  });
  it("marks the interview failed when the plan can't be made, without using quota", async () => {
    const { deps, pid, interviews, users } = await setup({ llmScript: ["{}", "{}"] });
    await expect(createInterview("u1", input(pid), deps)).rejects.toBeInstanceOf(LlmError);
    expect([...interviews.docs.values()][0].status).toBe("failed");
    expect(users.users.size).toBe(0);
  });
});

describe("startInterview", () => {
  it("starts, sets the clock, clears the expiry, and uses a free slot", async () => {
    const { deps, pid, users } = await setup();
    const { id } = await createInterview("u1", input(pid), deps);
    const iv = await startInterview("u1", id, deps);
    expect(iv).toMatchObject({ status: "in_progress", slot_source: "free", expire_at: null });
    expect(iv.ends_at?.getTime()).toBe(NOW.getTime() + 300_000);
    expect(users.users.get("u1")?.free).toBe(1);
  });
  it("uses a paid credit once free interviews are used up", async () => {
    const { deps, pid, users } = await setup({ freeLimit: 0, paid: 1 });
    const { id } = await createInterview("u1", input(pid), deps);
    expect((await startInterview("u1", id, deps)).slot_source).toBe("paid");
    expect(users.users.get("u1")?.paid).toBe(0);
  });
  it("rejects when no slots are left", async () => {
    const { deps, pid, users } = await setup();
    const a = await createInterview("u1", input(pid), deps);
    const b = await createInterview("u1", input(pid), deps);
    await startInterview("u1", a.id, deps);
    await expect(startInterview("u1", b.id, deps)).rejects.toMatchObject({ code: "quota_exceeded" });
    expect(users.users.get("u1")?.free).toBe(1);
  });
  it("lets only one of two simultaneous starts take the last slot", async () => {
    const { deps, pid, users } = await setup();
    const a = await createInterview("u1", input(pid), deps);
    const b = await createInterview("u1", input(pid), deps);
    const r = await Promise.allSettled([startInterview("u1", a.id, deps), startInterview("u1", b.id, deps)]);
    expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect((r.find((x) => x.status === "rejected") as PromiseRejectedResult).reason).toMatchObject({ code: "quota_exceeded" });
    expect(users.users.get("u1")?.free).toBe(1);
  });
  it("refunds the slot when the same interview is started twice at once", async () => {
    const { deps, pid, users } = await setup({ freeLimit: 5 });
    const { id } = await createInterview("u1", input(pid), deps);
    const r = await Promise.allSettled([startInterview("u1", id, deps), startInterview("u1", id, deps)]);
    expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect((r.find((x) => x.status === "rejected") as PromiseRejectedResult).reason).toMatchObject({ code: "interview_not_active" });
    expect(users.users.get("u1")?.free).toBe(1);
  });
  it("rejects invalid states and other users", async () => {
    const { deps, pid, interviews } = await setup({ freeLimit: 5 });
    const { id } = await createInterview("u1", input(pid), deps);
    await expect(startInterview("u2", id, deps)).rejects.toMatchObject({ code: "not_found" });
    await expect(startInterview("u1", "missing", deps)).rejects.toMatchObject({ code: "not_found" });
    await startInterview("u1", id, deps);
    await expect(startInterview("u1", id, deps)).rejects.toMatchObject({ code: "interview_not_active" });
    interviews.docs.get(id)!.status = "failed";
    await expect(startInterview("u1", id, deps)).rejects.toMatchObject({ code: "interview_not_active" });
  });
});

describe("state machine", () => {
  it("follows system-design-v0.1.md", () => {
    expect(canTransition("plan_ready", "in_progress")).toBe(true);
    expect(canTransition("in_progress", "wrapping_up")).toBe(true);
    expect(canTransition("wrapping_up", "completed")).toBe(true);
    expect(canTransition("created", "in_progress")).toBe(false);
    expect(canTransition("completed", "in_progress")).toBe(false);
    expect(canTransition("failed", "plan_ready")).toBe(false);
  });
});
