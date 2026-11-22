import { NextResponse } from "next/server";
import { apiError } from "@/lib/api-error";
import { getCurrentUserId } from "@/lib/dev-user";
import { rateLimited } from "@/lib/route-guard";
import { getProfile, patchProfile } from "@/lib/profile-service";
import { createMongoProfilesStore, type ProfileDoc } from "@/lib/profiles-store";
import { ProfilePatchSchema } from "@/lib/schemas";

type Ctx = { params: Promise<{ id: string }> };
const view = (p: ProfileDoc) => ({
  id: p.id, status: p.status, summary: p.summary, github_summary: p.github_summary,
  github_username: p.github_username, job_description: p.job_description, created_at: p.created_at, updated_at: p.updated_at,
});

export async function GET(_req: Request, { params }: Ctx) {
  const limited = await rateLimited(getCurrentUserId(), "general");
  if (limited) return limited;
  const p = await getProfile(getCurrentUserId(), (await params).id, { store: createMongoProfilesStore() });
  return p ? NextResponse.json(view(p)) : apiError("not_found", "Profile not found.");
}

export async function PATCH(request: Request, { params }: Ctx) {
  const limited = await rateLimited(getCurrentUserId(), "general");
  if (limited) return limited;
  const body = ProfilePatchSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return apiError("validation_failed", "Invalid profile changes.", { issues: body.error.issues.slice(0, 5).map((i) => i.message) });
  const p = await patchProfile(getCurrentUserId(), (await params).id, body.data, { store: createMongoProfilesStore() });
  return p ? NextResponse.json(view(p)) : apiError("not_found", "Profile not found or not ready.");
}
