import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/dev-user";
import { rateLimited } from "@/lib/route-guard";
import { interviewDeps } from "@/lib/deps";
import { createInterview } from "@/lib/interview-service";
import { handleError } from "@/lib/route-errors";
import { apiError } from "@/lib/api-error";

export async function POST(request: Request) {
  const limited = await rateLimited(getCurrentUserId(), "general");
  if (limited) return limited;
  const body = await request.json().catch(() => null);
  if (!body) return apiError("validation_failed", "Send a JSON body.");
  try {
    const iv = await createInterview(getCurrentUserId(), body, interviewDeps());
    return NextResponse.json(
      { id: iv.id, status: iv.status, role: iv.role, level: iv.level, duration_seconds: iv.duration_seconds, mode: iv.mode },
      { status: 201 },
    );
  } catch (err) {
    return handleError(err);
  }
}
