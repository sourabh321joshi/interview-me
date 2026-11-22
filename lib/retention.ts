export const INTERVIEW_RETENTION_DAYS = 30;

export function interviewExpiry(endedAt: Date) {
  return new Date(endedAt.getTime() + INTERVIEW_RETENTION_DAYS * 86_400_000);
}
