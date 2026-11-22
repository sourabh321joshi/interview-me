import { consentRequired } from "@/lib/consent";
import { apiError } from "@/lib/api-error";
import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/auth";
import { rateLimited } from "@/lib/route-guard";
import { interviewDeps } from "@/lib/deps";
import { startInterview } from "@/lib/interview-service";
import { handleError } from "@/lib/route-errors";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getCurrentUserId(request.headers);
  if (!userId) return apiError("unauthenticated", "Sign in to continue.");
  const limited = await rateLimited(userId, "general");
  if (limited) return limited;
  const consent = await consentRequired(userId);
  if (consent) return consent;
  try {
    const iv = await startInterview(userId, (await params).id, interviewDeps());
    return NextResponse.json({
      id: iv.id, status: iv.status, started_at: iv.started_at, ends_at: iv.ends_at, server_now: new Date().toISOString(),
    });
  } catch (err) {
    return handleError(err);
  }
}
