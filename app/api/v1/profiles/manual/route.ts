import { z } from "zod";
import { apiError } from "@/lib/api-error";
import { getCurrentUserId } from "@/lib/auth";
import { consentRequired } from "@/lib/consent";
import { saveManualProfile } from "@/lib/profiles-store";
import { rateLimited } from "@/lib/route-guard";
import { JobDescriptionSchema, ProfileSummarySchema } from "@/lib/schemas";

const input = z.object({
  summary: ProfileSummarySchema.refine(s => s.skills.some(Boolean) || s.projects.some(p => p.name) || s.experience.some(e => e.title), "Add a skill, project name, or role to personalize the interview."),
  job_description: JobDescriptionSchema,
});

export async function POST(request: Request) {
  const user = await getCurrentUserId(request.headers);
  if (!user) return apiError("unauthenticated", "Sign in to continue.");
  const limited = await rateLimited(user, "general");
  if (limited) return limited;
  const consent = await consentRequired(user);
  if (consent) return consent;
  const parsed = input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("validation_failed", parsed.error.issues[0].message);
  const { summary, job_description } = parsed.data;
  const id = await saveManualProfile(user, summary, job_description);
  return Response.json({ id, status: "ready", summary }, { status: 201 });
}
