import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/dev-user";
import { rateLimited } from "@/lib/route-guard";
import { interviewDeps } from "@/lib/deps";
import { startInterview } from "@/lib/interview-service";
import { handleError } from "@/lib/route-errors";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const limited = await rateLimited(getCurrentUserId(), "general");
  if (limited) return limited;
  try {
    const iv = await startInterview(getCurrentUserId(), (await params).id, interviewDeps());
    return NextResponse.json({
      id: iv.id, status: iv.status, started_at: iv.started_at, ends_at: iv.ends_at, server_now: new Date().toISOString(),
    });
  } catch (err) {
    return handleError(err);
  }
}
