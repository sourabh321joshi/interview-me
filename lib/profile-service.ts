import { LlmError } from "./llm";
import { buildProfile, MIN_RESUME_CHARS, type Warning } from "./profile-builder";
import { extractPdfText } from "./pdf";
import type { ProfileDoc, ProfilesStore } from "./profiles-store";
import type { ProfileSummary } from "./schemas";

export class ProfileInputError extends Error {}
type Deps = { store: ProfilesStore; llm: Parameters<typeof buildProfile>[1]["llm"]; fetchImpl?: typeof fetch; githubToken?: string };

export async function createProfile(
  userId: string,
  input: { pdf: Uint8Array; githubUsername?: string; jobDescription?: string },
  deps: Deps,
): Promise<{ profile: ProfileDoc; warnings: Warning[] }> {
  let resumeText: string;
  try {
    resumeText = await extractPdfText(input.pdf);
  } catch {
    throw new ProfileInputError("We couldn't read this PDF. Try exporting it again.");
  }
  if (resumeText.length < MIN_RESUME_CHARS) throw new ProfileInputError("No readable text found. Use a text-based PDF, not a scan.");

  const id = await deps.store.insert({ user_id: userId, github_username: input.githubUsername ?? null, job_description: input.jobDescription ?? null });
  try {
    const built = await buildProfile({ resumeText, githubUsername: input.githubUsername, ctx: { user_id: userId } }, deps);
    await deps.store.markReady(userId, id, { summary: built.summary, github_summary: built.github_summary });
    const profile = (await deps.store.findOwned(userId, id))!;
    return { profile, warnings: built.warnings };
  } catch (err) {
    await deps.store.markFailed(userId, id, err instanceof LlmError ? [err.code, err.providerStatus].filter(Boolean).join("_") : "internal");
    throw err;
  }
}

export const getProfile = (userId: string, id: string, deps: Pick<Deps, "store">) => deps.store.findOwned(userId, id);

export const patchProfile = (userId: string, id: string, patch: Partial<ProfileSummary>, deps: Pick<Deps, "store">) =>
  deps.store.patchSummary(userId, id, patch);
