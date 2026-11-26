import { z } from "zod";
import { codingChallenge } from "./coding-challenge";
import { SMOKE_TEST_DURATION, timeBudget } from "./interview-schemas";
import { DomainError } from "./interview-service";
import type { InterviewDoc, InterviewsStore, Turn } from "./interviews-store";
import { LlmError, type CallContext, type Message } from "./llm";
import type { ProfilesStore } from "./profiles-store";
import { loadPrompt, INTERVIEWER_PROMPT_VERSION, wrapData } from "./prompts";

export const MARKER = "[END_OF_INTERVIEW]";
export const MAX_TURNS = 40;
export const GRACE_MS = 15_000;
export const WRAPUP_SECONDS = 30;

function isPastDeadline(now: Date, endsAt: Date, duration: number) {
  const deadline = endsAt.getTime();
  return duration === SMOKE_TEST_DURATION ? now.getTime() >= deadline : now.getTime() > deadline + GRACE_MS;
}

export const TurnBodySchema = z.object({
  client_turn_id: z.uuid(),
  type: z.enum(["open", "answer", "silence", "code"]),
  text: z.string().trim().max(2000).optional(),
  code: z.string().max(2000).refine(code => !!code.trim()).optional(),
  output: z.string().max(2000).optional(),
});

// Removes the end marker from streamed text, even when it arrives split across chunks.
export class MarkerStripper {
  private buf = "";
  isFinal = false;
  push(chunk: string): string {
    if (this.isFinal) return "";
    this.buf += chunk;
    const i = this.buf.indexOf(MARKER);
    if (i >= 0) { this.isFinal = true; const out = this.buf.slice(0, i); this.buf = ""; return out; }
    let hold = 0; // keep a trailing piece that could still become the marker
    for (let k = Math.min(MARKER.length - 1, this.buf.length); k > 0; k--) {
      if (MARKER.startsWith(this.buf.slice(-k))) { hold = k; break; }
    }
    const out = this.buf.slice(0, this.buf.length - hold);
    this.buf = this.buf.slice(this.buf.length - hold);
    return out;
  }
  finish(): string { const out = this.isFinal ? "" : this.buf; this.buf = ""; return out; }
}

const ELAPSED_PREFIX = "[elapsed:";
const elapsedTag = /\[elapsed:\s*\d+:\d{2}\s+of\s+\d+:\d{2}\]/gi;
const hideElapsed = (text: string) => text.replace(elapsedTag, "").trimStart();
const endRequest = /(?:^|[.!?;,\n]\s*|\s+and\s+)(?:(?:please|let['’]?s|can we|could we)\s+)?(?:end|stop|finish)(?:\s+(?:this|the|my)\s+interview|\s+now)(?:\s+please)?[.!?\s]*$/i;

class ElapsedTagStripper {
  private pending = "";

  push(chunk: string) {
    this.pending += chunk;
    let result = "";
    while (this.pending) {
      const start = this.pending.indexOf("[");
      if (start === -1) {
        result += this.pending;
        this.pending = "";
        break;
      }
      result += this.pending.slice(0, start);
      this.pending = this.pending.slice(start);
      const lower = this.pending.toLowerCase();
      if (ELAPSED_PREFIX.startsWith(lower)) break;
      if (lower.startsWith(ELAPSED_PREFIX)) {
        const end = this.pending.indexOf("]");
        if (end === -1 && this.pending.length < 48) break;
        if (end !== -1) {
          result += this.pending.slice(0, end + 1).replace(elapsedTag, "");
          this.pending = this.pending.slice(end + 1);
          continue;
        }
      }
      result += this.pending[0];
      this.pending = this.pending.slice(1);
    }
    return result;
  }

  finish() {
    return this.pending;
  }
}

export type TurnEnd = { seq: number; text: string; is_final: boolean; remaining_seconds: number };
export type TurnEvent = { type: "delta"; text: string } | ({ type: "end" } & TurnEnd);
export type Prepared =
  | { kind: "replay"; end: TurnEnd }
  | { kind: "stream"; voice?: boolean; start: { seq: number; phase: string; remaining_seconds: number }; run: () => AsyncGenerator<TurnEvent> };
export type TurnDeps = {
  interviews: InterviewsStore; profiles: ProfilesStore; now?: () => Date;
  llm: { streamTurn(input: { system: string; messages: Message[]; ctx?: CallContext }): AsyncGenerator<string> };
};

const fmt = (ms: number) => { const s = Math.floor(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };

// Validates, saves the candidate's turn, and returns either a replay or a stream. Throws before any streaming starts.
export async function prepareTurn(userId: string, id: string, raw: unknown, deps: TurnDeps): Promise<Prepared> {
  const parsed = TurnBodySchema.safeParse(raw);
  if (!parsed.success) throw new DomainError("validation_failed", "Invalid turn request.");
  const body = parsed.data;
  if ((body.type === "answer") !== !!body.text) {
    throw new DomainError("validation_failed", body.type === "answer" ? "Answer text is required." : "This turn type takes no text.");
  }
  if ((body.type === "code") !== !!body.code || (body.type !== "code" && body.output !== undefined)) {
    throw new DomainError("validation_failed", body.type === "code" ? "JavaScript source is required." : "This turn type takes no code.");
  }

  const iv = await deps.interviews.findOwned(userId, id);
  if (!iv) throw new DomainError("not_found", "Interview not found.");
  if (body.type === "code" && iv.duration_seconds !== 600) {
    throw new DomainError("validation_failed", "Code submissions require a Standard interview.");
  }
  const now = deps.now?.() ?? new Date();
  const remaining = Math.max(0, Math.ceil(((iv.ends_at?.getTime() ?? 0) - now.getTime()) / 1000));
  const replay = (t: Turn): Prepared => ({ kind: "replay", end: { seq: t.seq, text: hideElapsed(t.text), is_final: iv.status === "completed" && t.seq === iv.turn_count - 1, remaining_seconds: remaining } });

  // Idempotency: a repeated request returns the stored reply instead of calling the model again.
  if (body.type === "open" && iv.turns[0]?.speaker === "interviewer") return replay(iv.turns[0]);
  const existing = iv.turns.find((t) => t.client_turn_id === body.client_turn_id);
  const reply = existing && iv.turns.find((t) => t.seq === existing.seq + 1 && t.speaker === "interviewer");
  if (reply) return replay(reply);

  if ((iv.status !== "in_progress" && iv.status !== "wrapping_up") || !iv.started_at || !iv.ends_at) throw new DomainError("interview_not_active", "This interview is not running.");
  if (isPastDeadline(now, iv.ends_at, iv.duration_seconds) || iv.turn_count >= MAX_TURNS) {
    await deps.interviews.complete(userId, id, "timeout", now);
    throw new DomainError("interview_expired", "This interview has ended.");
  }
  if (body.type === "open" && iv.turn_count > 0) throw new DomainError("interview_not_active", "The interview has already started.");
  if (body.type !== "open" && iv.turn_count === 0) throw new DomainError("validation_failed", "Start with an 'open' turn.");

  const startedAtMs = iv.started_at.getTime();
  const elapsedMs = now.getTime() - startedAtMs;
  const smokeTest = iv.duration_seconds === SMOKE_TEST_DURATION;
  const wrapSeconds = smokeTest ? timeBudget(iv.duration_seconds).wrapup : WRAPUP_SECONDS;
  const wantsToEnd = body.type === "answer" && endRequest.test(existing?.text ?? body.text ?? "");
  const wrap = wantsToEnd || remaining <= wrapSeconds;
  if (wrap) await deps.interviews.markWrappingUp(userId, id);

  let turns = iv.turns;
  if (body.type !== "open" && !existing) {
    const candidate: Turn = {
      seq: iv.turn_count, speaker: "candidate", kind: body.type === "answer" ? "text" : body.type === "code" ? "code" : "system",
      ...(body.type === "code" && body.output ? { output: body.output } : {}),
      text: body.code ?? (body.type === "answer" ? body.text! : "(silence)"), t_offset_ms: elapsedMs, client_turn_id: body.client_turn_id, created_at: now,
    };
    if (!(await deps.interviews.appendTurn(userId, id, iv.turn_count, candidate, body.client_turn_id))) {
      throw new DomainError("interview_not_active", "Another request is already in progress for this interview.");
    }
    turns = [...turns, candidate];
  }
  const seq = turns.length;

  const profile = iv.profile_id ? await deps.profiles.findOwned(userId, iv.profile_id) : null;
  // The planner has already seen the full profile and job description.
  const summary = profile?.summary;
  const repos = profile?.github_summary?.repos ?? [];
  const normalizeName = (name: string) => name.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
  const plannedProject = normalizeName(iv.plan?.project_to_probe ?? "");
  const project = summary?.projects.find((item) => plannedProject && normalizeName(item.name) === plannedProject);
  const repo = repos.find((item) => plannedProject && normalizeName(item.name) === plannedProject);
  const selectedProject = project ?? (repo ? undefined : summary?.projects[0]);
  const selectedRepo = repo ?? (selectedProject
    ? repos.find((item) => normalizeName(item.name) === normalizeName(selectedProject.name))
    : repos[0]);

  const briefing = summary ? {
    first_name: summary.first_name,
    years_experience: summary.years_experience,
    skills: summary.skills.slice(0, 8),
    project: selectedProject,
    github_repo: selectedRepo && {
      name: selectedRepo.name,
      languages: selectedRepo.languages,
      readme_gist: selectedRepo.readme_gist.slice(0, 200),
      notable: selectedRepo.notable.slice(0, 1),
    },
  } : null;
  const plan = iv.plan && {
    project_questions: project || repo ? iv.plan.project_questions : [],
    fundamentals_topics: iv.plan.fundamentals_topics,
    risks: project || repo ? iv.plan.risks.slice(0, 2) : [],
  };
  const system = loadPrompt(smokeTest ? "interviewer-smoke-test" : "interviewer", {
    role_and_level: `${iv.role}, ${iv.level}`,
    duration_minutes: String(iv.duration_seconds / 60),
    candidate_profile: wrapData("candidate_profile", briefing ? JSON.stringify(briefing) : "Not available."),
    job_description: wrapData("job_description", profile?.job_description?.slice(0, 500) || "none"),
  }, iv.prompt_version === "0.1" ? "0.1" : INTERVIEWER_PROMPT_VERSION) + "\n\nINTERVIEW PLAN (data from the planner)\n" + wrapData("interview_plan", JSON.stringify(plan));

  const tag = (ms: number) => `[elapsed: ${fmt(ms)} of ${fmt(iv.duration_seconds * 1000)}]`;
  const interviewSystem = iv.duration_seconds === 600
    ? system + "\n\n" + loadPrompt("interviewer-coding", { challenge: codingChallenge.task, examples: JSON.stringify(codingChallenge.cases) })
    : system;
  const messages: Message[] = [{ role: "user", content: `${tag(0)} (The interview is starting. Greet the candidate and ask your first question.)` }];
  for (const t of turns) {
    const candidateContent = t.kind === "system" ? "(The candidate has been silent for a while.)"
      : t.kind === "code" ? [wrapData("candidate_code", t.text), t.output && wrapData("candidate_output", t.output)].filter(Boolean).join("\n")
      : t.text;
    messages.push(t.speaker === "interviewer"
      ? { role: "assistant", content: hideElapsed(t.text) }
      : { role: "user", content: `${tag(t.t_offset_ms)} ${candidateContent}` });
  }
  if (wrap) messages[messages.length - 1].content += `\n[server note: about ${wrapSeconds} seconds remain. Give your closing message now, then add the end marker line.]`;

  const b = iv.plan?.time_budget_seconds;
  const e = elapsedMs / 1000;
  const phase = body.type === "open" ? "opening" : wrap ? "wrapup" : !b || e < b.opening ? "opening" : e < b.opening + b.project ? "project" : e < b.opening + b.project + b.fundamentals ? "fundamentals" : "wrapup";

  async function* run(): AsyncGenerator<TurnEvent> {
    const strip = new MarkerStripper();
    const elapsed = new ElapsedTagStripper();
    const chunks = wantsToEnd
      ? [`Thanks for practicing. Your interview is complete.
${MARKER}`]
      : deps.llm.streamTurn({ system: interviewSystem, messages, ctx: { user_id: userId, interview_id: id } });
    let text = "";
    for await (const d of chunks) {
      const out = elapsed.push(strip.push(d));
      if (out) { text += out; yield { type: "delta", text: out }; }
    }
    const tail = elapsed.push(strip.finish()) + elapsed.finish();
    if (tail) { text += tail; yield { type: "delta", text: tail }; }
    text = text.trim();
    if (!text) throw new LlmError("upstream_unavailable", "Empty reply", true);

    const doneAt = deps.now?.() ?? new Date();
    const turn: Turn = { seq, speaker: "interviewer", kind: "text", text, t_offset_ms: doneAt.getTime() - startedAtMs, client_turn_id: null, created_at: doneAt };
    if (!(await deps.interviews.appendTurn(userId, id, seq, turn, null))) throw new DomainError("interview_not_active", "Another request is already in progress for this interview.");
    if (strip.isFinal) await deps.interviews.complete(userId, id, wantsToEnd ? "user_ended" : "model_finished", doneAt);
    yield { type: "end", seq, text, is_final: strip.isFinal, remaining_seconds: remaining };
  }
  return { kind: "stream", voice: iv.mode === "voice" && !wantsToEnd, start: { seq, phase, remaining_seconds: remaining }, run };
}

export async function getInterviewView(userId: string, id: string, deps: Pick<TurnDeps, "interviews" | "now">) {
  let iv = await deps.interviews.findOwned(userId, id);
  if (!iv) throw new DomainError("not_found", "Interview not found.");
  const now = deps.now?.() ?? new Date();
  const running = iv.status === "in_progress" || iv.status === "wrapping_up";
  if (running && iv.ends_at && isPastDeadline(now, iv.ends_at, iv.duration_seconds)) { // heal interviews nobody finished
    await deps.interviews.complete(userId, id, "timeout", now);
    iv = (await deps.interviews.findOwned(userId, id)) as InterviewDoc;
  }
  return {
    id: iv.id, status: iv.status, role: iv.role, level: iv.level, mode: iv.mode, duration_seconds: iv.duration_seconds,
    started_at: iv.started_at, ends_at: iv.ends_at, expire_at: iv.expire_at ?? null, server_now: now.toISOString(),
    remaining_seconds: iv.ends_at ? Math.max(0, Math.ceil((iv.ends_at.getTime() - now.getTime()) / 1000)) : null,
    turns: iv.turns.map((t) => ({ seq: t.seq, speaker: t.speaker, kind: t.kind, ...(t.kind === "code" && t.output ? { output: t.output } : {}), text: t.speaker === "interviewer" ? hideElapsed(t.text) : t.text, t_offset_ms: t.t_offset_ms, client_turn_id: t.speaker === "candidate" ? t.client_turn_id : null })),
  };
}

// Runs a prepared turn to the end and returns every event (used by tests and tooling).
export async function collect(p: Prepared): Promise<TurnEvent[]> {
  if (p.kind === "replay") return [{ type: "end", ...p.end }];
  const out: TurnEvent[] = [];
  for await (const ev of p.run()) out.push(ev);
  return out;
}
