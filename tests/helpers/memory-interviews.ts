import { interviewAllowance } from "@/lib/quota";
import type { InterviewDoc, InterviewsStore, SlotSource, UsersStore } from "@/lib/interviews-store";

export function memoryInterviews(): InterviewsStore & { docs: Map<string, InterviewDoc> } {
  const docs = new Map<string, InterviewDoc>();
  let n = 0;
  const own = (u: string, id: string) => { const d = docs.get(id); return d && d.user_id === u ? d : null; };
  return {
    docs,
    async insert(doc) {
      const id = `i${++n}`;
      docs.set(id, { id, ...doc, status: "created", plan: null, slot_source: null, started_at: null, ends_at: null, turns: [], turn_count: 0, ended_at: null, end_reason: null });
      return id;
    },
    async findOwned(u, id) { const d = own(u, id); return d ? { ...d, turns: [...d.turns] } : null; }, // copy, like a real read
    async setPlan(u, id, plan) {
      const d = own(u, id);
      if (!d || d.status !== "created") return false;
      Object.assign(d, { plan, status: "plan_ready" });
      return true;
    },
    async markFailed(u, id) { const d = own(u, id); if (d && (d.status === "created" || d.status === "plan_ready")) d.status = "failed"; },
    async appendTurn(u, id, expectedSeq, turn, clientTurnId) { // same checks as the real filter, in one synchronous step
      const d = own(u, id);
      if (!d || (d.status !== "in_progress" && d.status !== "wrapping_up") || d.turn_count !== expectedSeq) return false;
      if (clientTurnId && d.turns.some((t) => t.client_turn_id === clientTurnId)) return false;
      d.turns = [...d.turns, turn];
      d.turn_count += 1;
      return true;
    },
    async markWrappingUp(u, id) { const d = own(u, id); if (d?.status === "in_progress") d.status = "wrapping_up"; },
    async complete(u, id, reason, endedAt) {
      const d = own(u, id);
      if (d && (d.status === "in_progress" || d.status === "wrapping_up")) Object.assign(d, { status: "completed", end_reason: reason, ended_at: endedAt });
    },
    async start(u, id, data) {
      const d = own(u, id);
      if (!d || d.status !== "plan_ready") return null;
      Object.assign(d, { status: "in_progress", ...data, expire_at: null });
      return { ...d };
    },
  };
}

export function memoryUsers(paid = 0): UsersStore & { users: Map<string, { free: number; paid: number }> } {
  const users = new Map<string, { free: number; paid: number }>();
  return {
    users,
    async allowance(u, limit) {
      const account = users.get(u);
      return interviewAllowance(limit, { free_interviews_used: account?.free, paid_interview_credits: account?.paid ?? paid });
    },
    async ensureUser(u) { if (!users.has(u)) users.set(u, { free: 0, paid }); },
    async reserveSlot(u, limit): Promise<SlotSource | null> { // check and update in one step, like the real atomic update
      const x = users.get(u)!;
      if (x.free < limit) { x.free++; return "free"; }
      if (x.paid > 0) { x.paid--; return "paid"; }
      return null;
    },
    async refundSlot(u, source) { const x = users.get(u)!; if (source === "free") x.free--; else x.paid++; },
  };
}
