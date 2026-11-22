import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/dev-user";
import { rateLimited } from "@/lib/route-guard";
import { interviewDeps } from "@/lib/deps";
import { handleError } from "@/lib/route-errors";
import { getInterviewView } from "@/lib/turn-service";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const limited = await rateLimited(getCurrentUserId(), "general");
  if (limited) return limited;
  try {
    return NextResponse.json(await getInterviewView(getCurrentUserId(), (await params).id, interviewDeps()));
  } catch (err) {
    return handleError(err);
  }
}
