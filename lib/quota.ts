export type InterviewAllowance = {
  free_interviews_remaining: number;
  paid_credits: number;
};

export function interviewAllowance(
  freeLimit: number,
  record?: { free_interviews_used?: number; paid_interview_credits?: number } | null,
): InterviewAllowance {
  return {
    free_interviews_remaining: Math.max(0, freeLimit - (record?.free_interviews_used ?? 0)),
    paid_credits: Math.max(0, record?.paid_interview_credits ?? 0),
  };
}

export function hasInterviewSlot(allowance: InterviewAllowance) {
  return allowance.free_interviews_remaining > 0 || allowance.paid_credits > 0;
}

export function freeInterviewLimit() {
  const limit = Number.parseInt(process.env.FREE_INTERVIEW_LIMIT ?? "1", 10);
  return Number.isFinite(limit) ? Math.max(0, limit) : 1;
}
