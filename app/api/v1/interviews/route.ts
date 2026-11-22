import { HistoryQuery, listInterviewHistory } from "@/lib/history";
import { consentRequired } from "@/lib/consent";
import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/auth";
import { rateLimited } from "@/lib/route-guard";
import { interviewDeps } from "@/lib/deps";
import { createInterview } from "@/lib/interview-service";
import { handleError } from "@/lib/route-errors";
import { apiError } from "@/lib/api-error";

export async function POST(request: Request) {
  const userId = await getCurrentUserId(request.headers);
  if (!userId) return apiError("unauthenticated", "Sign in to continue.");
  const limited = await rateLimited(userId, "general");
  if (limited) return limited;
  const consent = await consentRequired(userId);
  if (consent) return consent;
  const body = await request.json().catch(() => null);
  if (!body) return apiError("validation_failed", "Send a JSON body.");
  try {
    const iv = await createInterview(userId, body, interviewDeps());
    return NextResponse.json(
      { id: iv.id, status: iv.status, role: iv.role, level: iv.level, duration_seconds: iv.duration_seconds, mode: iv.mode },
      { status: 201 },
    );
  } catch (err) {
    return handleError(err);
  }
}

export async function GET(request: Request) {
  const userId = await getCurrentUserId(request.headers);
  if (!userId) return apiError("unauthenticated", "Sign in to continue.");
  const limited = await rateLimited(userId, "general");
  if (limited) return limited;
  const query = HistoryQuery.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!query.success) return apiError("validation_failed", "Invalid history limit or cursor.");
  try {
    return NextResponse.json(await listInterviewHistory(userId, query.data));
  } catch (error) {
    return handleError(error);
  }
}
