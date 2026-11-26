export const FREE_DURATION = 180;

export const interviewPlans = [
  { id: "quick", seconds: FREE_DURATION, amount: 900, label: "Quick try" },
  { id: "full", seconds: 900, amount: 4900, label: "Full practice" },
  { id: "deep", seconds: 1800, amount: 8900, label: "Deep practice" },
] as const;

export function supportsCoding(seconds: number) {
  return seconds === 600 || seconds === 900 || seconds === 1800;
}

export function isPaidPlanDuration(seconds: number) {
  return interviewPlans.some(plan => plan.seconds === seconds);
}
