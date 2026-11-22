import { z } from "zod";
import { DomainError } from "./interview-service";
import type { InterviewDoc, InterviewsStore, Turn } from "./interviews-store";
import { LlmError, type CallContext, type Message } from "./llm";
import type { ProfilesStore } from "./profiles-store";
import { loadPrompt, wrapData } from "./prompts";

export const MARKER = "[END_OF_INTERVIEW]";
export const MAX_TURNS = 40;
export const GRACE_MS = 15_000;
export const WRAPUP_SECONDS = 30;

export const TurnBodySchema = z.object({
  client_turn_id: z.uuid(),
  type: z.enum(["open", "answer", "silence"]),
  text: z.string().trim().max(2000).optional(),
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

export type TurnEnd = { seq: number; text: string; is_final: boolean; remaining_seconds: number };
export type TurnEvent = { type: "delta"; text: string } | ({ type: "end" } & TurnEnd);
export type Prepared =
  | { kind: "replay"; end: TurnEnd }
  | { kind: "stream"; start: { seq: number; phase: string; remaining_seconds: number }; run: () => AsyncGenerator<TurnEvent> };
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
  if (body.type === "answer" ? !body.text : !!body.text) throw new DomainError("validation_failed", body.type === "answer" ? "Answer text is required." : "This turn type takes no text.");

  const iv = await deps.interviews.findOwned(userId, id);
  if (!iv) throw new DomainError("not_found", "Interview not found.");
  const now = deps.now?.() ?? new Date();
  const remaining = Math.max(0, Math.ceil(((iv.ends_at?.getTime() ?? 0) - now.getTime()) / 1000));
  const replay = (t: Turn): Prepared => ({ kind: "replay", end: { seq: t.seq, text: t.text, is_final: iv.status === "completed" && t.seq === iv.turn_count - 1, remaining_seconds: remaining } });

  // Idempotency: a repeated request returns the stored reply instead of calling the model again.
  if (body.type === "open" && iv.turns[0]?.speaker === "interviewer") return replay(iv.turns[0]);
  const existing = iv.turns.find((t) => t.client_turn_id === body.client_turn_id);
  const reply = existing && iv.turns.find((t) => t.seq === existing.seq + 1 && t.speaker === "interviewer");
  if (reply) return replay(reply);

  if ((iv.status !== "in_progress" && iv.status !== "wrapping_up") || !iv.started_at || !iv.ends_at) throw new DomainError("interview_not_active", "This interview is not running.");
  if (now.getTime() > iv.ends_at.getTime() + GRACE_MS || iv.turn_count >= MAX_TURNS) {
    await deps.interviews.complete(userId, id, "timeout", now);
    throw new DomainError("interview_expired", "This interview has ended.");
  }
  if (body.type === "open" && iv.turn_count > 0) throw new DomainError("interview_not_active", "The interview has already started.");
  if (body.type !== "open" && iv.turn_count === 0) throw new DomainError("validation_failed", "Start with an 'open' turn.");

  const startedAtMs = iv.started_at.getTime();
  const elapsedMs = now.getTime() - startedAtMs;
  const wrap = remaining <= WRAPUP_SECONDS;
  if (wrap) await deps.interviews.markWrappingUp(userId, id);

  let turns = iv.turns;
  if (body.type !== "open" && !existing) {
    const candidate: Turn = {
      seq: iv.turn_count, speaker: "candidate", kind: body.type === "answer" ? "text" : "system",
      text: body.type === "answer" ? body.text! : "(silence)", t_offset_ms: elapsedMs, client_turn_id: body.client_turn_id, created_at: now,
    };
    if (!(await deps.interviews.appendTurn(userId, id, iv.turn_count, candidate, body.client_turn_id))) {
      throw new DomainError("interview_not_active", "Another request is already in progress for this interview.");
    }
    turns = [...turns, candidate];
  }
  const seq = turns.length;

  const profile = iv.profile_id ? await deps.profiles.findOwned(userId, iv.profile_id) : null;
  const system = loadPrompt("interviewer", {
    role_and_level: `${iv.role}, ${iv.level}`,
    duration_minutes: String(iv.duration_seconds / 60),
    candidate_profile: wrapData("candidate_profile", profile?.summary ? JSON.stringify({ summary: profile.summary, github_repos: profile.github_summary?.repos ?? [] }) : "Not available."),
    job_description: wrapData("job_description", profile?.job_description ?? "none"),
  }) + "\n\nINTERVIEW PLAN (data from the planner)\n" + wrapData("interview_plan", JSON.stringify(iv.plan));

  const tag = (ms: number) => `[elapsed: ${fmt(ms)} of ${fmt(iv.duration_seconds * 1000)}]`;
  const messages: Message[] = [{ role: "user", content: `${tag(0)} (The interview is starting. Greet the candidate and ask your first question.)` }];
  for (const t of turns) {
    messages.push(t.speaker === "interviewer"
      ? { role: "assistant", content: t.text }
      : { role: "user", content: `${tag(t.t_offset_ms)} ${t.kind === "system" ? "(The candidate has been silent for a while.)" : t.text}` });
  }
  if (wrap) messages[messages.length - 1].content += "\n[server note: about 30 seconds remain. Give your closing message now, then add the end marker line.]";

  const b = iv.plan?.time_budget_seconds;
  const e = elapsedMs / 1000;
  const phase = body.type === "open" ? "opening" : wrap ? "wrapup" : !b || e < b.opening ? "opening" : e < b.opening + b.project ? "project" : e < b.opening + b.project + b.fundamentals ? "fundamentals" : "wrapup";

  async function* run(): AsyncGenerator<TurnEvent> {
    const strip = new MarkerStripper();
    let text = "";
    for await (const d of deps.llm.streamTurn({ system, messages, ctx: { user_id: userId, interview_id: id } })) {
      const out = strip.push(d);
      if (out) { text += out; yield { type: "delta", text: out }; }
    }
    const tail = strip.finish();
    if (tail) { text += tail; yield { type: "delta", text: tail }; }
    text = text.trim();
    if (!text) throw new LlmError("upstream_unavailable", "Empty reply", true);

    const doneAt = deps.now?.() ?? new Date();
    const turn: Turn = { seq, speaker: "interviewer", kind: "text", text, t_offset_ms: doneAt.getTime() - startedAtMs, client_turn_id: null, created_at: doneAt };
    if (!(await deps.interviews.appendTurn(userId, id, seq, turn, null))) throw new DomainError("interview_not_active", "Another request is already in progress for this interview.");
    if (strip.isFinal) await deps.interviews.complete(userId, id, "model_finished", doneAt);
    yield { type: "end", seq, text, is_final: strip.isFinal, remaining_seconds: remaining };
  }
  return { kind: "stream", start: { seq, phase, remaining_seconds: remaining }, run };
}

export async function getInterviewView(userId: string, id: string, deps: Pick<TurnDeps, "interviews" | "now">) {
  let iv = await deps.interviews.findOwned(userId, id);
  if (!iv) throw new DomainError("not_found", "Interview not found.");
  const now = deps.now?.() ?? new Date();
  const running = iv.status === "in_progress" || iv.status === "wrapping_up";
  if (running && iv.ends_at && now.getTime() > iv.ends_at.getTime() + GRACE_MS) { // heal interviews nobody finished
    await deps.interviews.complete(userId, id, "timeout", now);
    iv = (await deps.interviews.findOwned(userId, id)) as InterviewDoc;
  }
  return {
    id: iv.id, status: iv.status, role: iv.role, level: iv.level, mode: iv.mode, duration_seconds: iv.duration_seconds,
    started_at: iv.started_at, ends_at: iv.ends_at, server_now: now.toISOString(),
    remaining_seconds: iv.ends_at ? Math.max(0, Math.ceil((iv.ends_at.getTime() - now.getTime()) / 1000)) : null,
    turns: iv.turns.map((t) => ({ seq: t.seq, speaker: t.speaker, kind: t.kind, text: t.text, t_offset_ms: t.t_offset_ms, client_turn_id: t.speaker === "candidate" ? t.client_turn_id : null })),
  };
}

// Runs a prepared turn to the end and returns every event (used by tests and tooling).
export async function collect(p: Prepared): Promise<TurnEvent[]> {
  if (p.kind === "replay") return [{ type: "end", ...p.end }];
  const out: TurnEvent[] = [];
  for await (const ev of p.run()) out.push(ev);
  return out;
}
