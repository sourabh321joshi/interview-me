import { consentRequired } from "@/lib/consent";
import { NextResponse } from "next/server";
import { apiError } from "@/lib/api-error";
import { getCurrentUserId } from "@/lib/auth";
import { rateLimited } from "@/lib/route-guard";
import { getLlm, LlmError } from "@/lib/llm";
import { checkPdf, MAX_RESUME_BYTES } from "@/lib/pdf";
import { createProfile, ProfileInputError } from "@/lib/profile-service";
import { createMongoProfilesStore } from "@/lib/profiles-store";
import { GithubUsernameSchema, JobDescriptionSchema } from "@/lib/schemas";

export async function POST(request: Request) {
  const userId = await getCurrentUserId(request.headers);
  if (!userId) return apiError("unauthenticated", "Sign in to continue.");
  const limited = await rateLimited(userId, "general", "profiles");
  if (limited) return limited;
  const consent = await consentRequired(userId);
  if (consent) return consent;
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_RESUME_BYTES + 100_000) return apiError("file_too_large", "Resume must be 5 MB or smaller.");

  const form = await request.formData().catch(() => null);
  const file = form?.get("resume");
  if (!(file instanceof File)) return apiError("validation_failed", "Upload your resume as a PDF in the 'resume' field.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const check = checkPdf(bytes);
  if (check === "too_large") return apiError("file_too_large", "Resume must be 5 MB or smaller.");
  if (check === "not_pdf") return apiError("validation_failed", "The resume must be a PDF file.");

  const gh = String(form?.get("github_username") ?? "").trim().replace(/^@/, "");
  if (gh && !GithubUsernameSchema.safeParse(gh).success) return apiError("validation_failed", "That doesn't look like a GitHub username.");
  const jd = JobDescriptionSchema.safeParse(String(form?.get("job_description") ?? ""));
  if (!jd.success) return apiError("validation_failed", "Job description must be 5,000 characters or fewer.");

  try {
    const { profile, warnings } = await createProfile(
      userId,
      { pdf: bytes, githubUsername: gh || undefined, jobDescription: jd.data || undefined },
      { store: createMongoProfilesStore(), llm: getLlm(), githubToken: process.env.GITHUB_TOKEN },
    );
    return NextResponse.json({
      id: profile.id, status: profile.status, summary: profile.summary,
      github: { included: !!profile.github_summary, repos_used: profile.github_summary?.repos.length ?? 0 }, warnings,
    }, { status: 201 });
  } catch (err) {
    if (err instanceof ProfileInputError) return apiError("validation_failed", err.message);
    if (err instanceof LlmError) {
      const status = err.providerStatus;
      let message = "The profile service could not complete the request.";
      if (status === 429) message = "The AI provider reached its request or usage limit.";
      else if (status === 401 || status === 403 || err.code === "config") message = "The profile service needs its API credentials or configuration checked.";
      else if (status === 404) message = "The configured profile model is unavailable.";
      else if (err.code === "invalid_output") message = "The AI response did not match the profile format.";
      return apiError("upstream_unavailable", message + " You can enter your profile manually.", { profile_failed: true, provider_status: status });
    }
    return apiError("internal", "Something went wrong building your profile.");
  }
}
