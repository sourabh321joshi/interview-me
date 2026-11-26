import { createInterview, startInterview } from "@/lib/interview-service";
import type { Message } from "@/lib/llm";
import type { ProfileSummary } from "@/lib/schemas";
import { collect as collectEvents, type TurnDeps } from "@/lib/turn-service";
import { fakeLlm, SUMMARY } from "./fake-llm";
import { memoryInterviews, memoryUsers } from "./memory-interviews";
import { memoryStore } from "./memory-store";

export const PLAN = JSON.stringify({
  project_to_probe: "TaskFlow", why_this_project: "Most substantial", project_questions: ["q1", "q2", "q3"],
  fundamentals_topics: ["Closures"], risks: [],
});
export const T0 = new Date("2026-11-14T10:00:00Z");

// A fake model for turns: each script entry is one call; strings are chunks, an Error is thrown mid-stream.
export function fakeTurnLlm(script: Array<Array<string | Error>>) {
  const calls: { system: string; messages: Message[] }[] = [];
  const llm: TurnDeps["llm"] = {
    async *streamTurn(input) {
      calls.push({ system: input.system, messages: input.messages.map((m) => ({ ...m })) });
      for (const c of script.shift() ?? []) { if (c instanceof Error) throw c; yield c; }
    },
  };
  return { llm, calls };
}

export async function startedInterview(script: Array<Array<string | Error>>, duration = 300) {
  const profiles = memoryStore();
  const pid = await profiles.insert({ user_id: "u1", github_username: null, job_description: null });
  await profiles.markReady("u1", pid, { summary: SUMMARY as unknown as ProfileSummary, github_summary: null });
  const interviews = memoryInterviews();
  const clock = { t: T0 };
  const now = () => clock.t;
  const base = { interviews, users: memoryUsers(), profiles, llm: fakeLlm([PLAN]).llm, models: () => ({ plan: "m", turn: "m", report: "m" }), freeLimit: 5, now };
  const { id } = await createInterview("u1", { profile_id: pid, role: "frontend", level: "fresher", duration_seconds: duration }, base);
  const started = await startInterview("u1", id, base);
  const turnLlm = fakeTurnLlm(script);
  const deps: TurnDeps = { interviews, profiles, llm: turnLlm.llm, now };
  return { id, deps, interviews, clock, calls: turnLlm.calls, endsAt: started.ends_at!.getTime() };
}
export { collectEvents };
