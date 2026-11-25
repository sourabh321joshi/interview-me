export function freeInterviewLimit() {
  return Number.parseInt(process.env.FREE_INTERVIEW_LIMIT ?? "1", 10);
}
