import { after, NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/dev-user";
import { rateLimited } from "@/lib/route-guard";
import { reportDeps } from "@/lib/deps";
import { endInterview, generateReport } from "@/lib/report-service";
import { handleError } from "@/lib/route-errors";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const limited = await rateLimited(getCurrentUserId(), "general");
  if (limited) return limited;
  const id = (await params).id;
  const userId = getCurrentUserId();
  const deps = reportDeps();
  try {
    const r = await endInterview(userId, id, deps);
    if (r.shouldGenerate) after(() => generateReport(userId, id, deps).catch(() => console.warn("report generation failed")));
    return NextResponse.json({ status: "completed", report_status: r.report_status }, { status: 202 });
  } catch (err) {
    return handleError(err);
  }
}
