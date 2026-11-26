import { FREE_DURATION, isPaidPlanDuration } from "./interview-plans";

export type InterviewAllowance = {
  free_interviews_remaining: number;
  paid_credits: number;
  smoke_interviews_remaining?: number;
  credits_by_duration?: Record<string, number>;
};

export function interviewAllowance(
  freeLimit: number,
  record?: { free_interviews_used?: number; paid_interview_credits?: number; paid_duration_credits?: Record<string, number> } | null,
): InterviewAllowance {
  return {
    free_interviews_remaining: Math.max(0, freeLimit - (record?.free_interviews_used ?? 0)),
    paid_credits: Math.max(0, record?.paid_interview_credits ?? 0),
    ...(record?.paid_duration_credits ? { credits_by_duration: record.paid_duration_credits } : {}),
  };
}

export function hasInterviewSlot(allowance: InterviewAllowance) {
  return allowance.free_interviews_remaining > 0 || allowance.paid_credits > 0;
}

export function canUseFreeInterview(duration?: number) {
  return duration === undefined || duration === FREE_DURATION || duration === 60;
}

export function hasInterviewSlotForDuration(allowance: InterviewAllowance, duration: number) {
  const free = duration === 60 ? allowance.smoke_interviews_remaining ?? allowance.free_interviews_remaining : allowance.free_interviews_remaining;
  if (canUseFreeInterview(duration) && free > 0) return true;
  return isPaidPlanDuration(duration)
    ? (allowance.credits_by_duration?.[duration] ?? 0) > 0
    : allowance.paid_credits > 0;
}

export function freeInterviewLimit() {
  if (process.env.NODE_ENV === "production") return 1;
  const limit = Number.parseInt(process.env.FREE_INTERVIEW_LIMIT ?? "1", 10);
  return Number.isFinite(limit) ? Math.max(0, limit) : 1;
}
