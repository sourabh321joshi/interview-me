import { z } from "zod";

export const ALLOWED_DURATIONS = [180, 300, 600, 900, 1800] as const;
export const SMOKE_TEST_DURATION = 60;

export const CreateInterviewSchema = z.object({
  profile_id: z.string().min(1),
  role: z.enum(["frontend", "backend", "fullstack"]),
  level: z.enum(["fresher", "junior"]),
  duration_seconds: z.literal([SMOKE_TEST_DURATION, ...ALLOWED_DURATIONS])
    .refine((duration) => duration !== SMOKE_TEST_DURATION || process.env.NODE_ENV === "development",
      "The one-minute interview is for local development."),
  mode: z.enum(["voice", "text"]).default("text"),
});
export type CreateInterviewInput = z.infer<typeof CreateInterviewSchema>;

const s = (max: number) => z.string().trim().max(max);
// What the model returns. Unknown keys (including time_budget_seconds) are dropped.
export const LlmPlanSchema = z.object({
  project_to_probe: s(100),
  why_this_project: s(300),
  project_questions: z.array(s(300)).min(1).max(5),
  fundamentals_topics: z.array(s(100)).min(1).max(3),
  risks: z.array(s(300)).max(5),
});
export type Plan = z.infer<typeof LlmPlanSchema> & {
  schema_version: 1;
  time_budget_seconds: { opening: number; project: number; fundamentals: number; wrapup: number };
};

// Server-computed, so the model cannot change pacing. Same 20/150/90/30 split as a 300 s interview.
export function timeBudget(duration: number): Plan["time_budget_seconds"] {
  return {
    opening: Math.round((duration * 20) / 300),
    project: Math.round((duration * 150) / 300),
    fundamentals: Math.round((duration * 90) / 300),
    wrapup: Math.round((duration * 30) / 300),
  };
}
