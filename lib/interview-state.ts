import type { InterviewStatus } from "./interviews-store";

// From system-design-v0.1.md, section 5.
const NEXT: Record<InterviewStatus, InterviewStatus[]> = {
  created: ["plan_ready", "failed"],
  plan_ready: ["in_progress", "abandoned"],
  in_progress: ["wrapping_up", "completed", "abandoned", "failed"],
  wrapping_up: ["completed"],
  completed: [],
  abandoned: [],
  failed: [],
};

export const canTransition = (from: InterviewStatus, to: InterviewStatus) => NEXT[from].includes(to);
