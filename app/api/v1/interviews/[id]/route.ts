import { deleteInterview } from "@/lib/interview-deletion";
import { apiError } from "@/lib/api-error";
import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/auth";
import { rateLimited } from "@/lib/route-guard";
import { interviewDeps } from "@/lib/deps";
import { handleError } from "@/lib/route-errors";
import { getInterviewView } from "@/lib/turn-service";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getCurrentUserId(request.headers);
  if (!userId) return apiError("unauthenticated", "Sign in to continue.");
  const limited = await rateLimited(userId, "general");
  if (limited) return limited;
  try {
    return NextResponse.json(await getInterviewView(userId, (await params).id, interviewDeps()));
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getCurrentUserId(request.headers);
  if (!userId) return apiError("unauthenticated", "Sign in to continue.");
  const limited = await rateLimited(userId, "general");
  if (limited) return limited;
  try {
    if (!await deleteInterview(userId, (await params).id)) {
      return apiError("not_found", "Interview not found.");
    }
    return new Response(null, { status: 204 });
  } catch (err) {
    return handleError(err);
  }
}
