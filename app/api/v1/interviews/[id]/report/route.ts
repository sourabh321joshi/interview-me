import { apiError } from "@/lib/api-error";
import { after, NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/auth";
import { rateLimited } from "@/lib/route-guard";
import { reportDeps } from "@/lib/deps";
import { generateReport, getReport } from "@/lib/report-service";
import { handleError } from "@/lib/route-errors";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getCurrentUserId(request.headers);
  if (!userId) return apiError("unauthenticated", "Sign in to continue.");
  const limited = await rateLimited(userId, "general");
  if (limited) return limited;
  const id = (await params).id;
  const deps = reportDeps();
  try {
    const r = await getReport(userId, id, deps);
    if (r.shouldGenerate) after(() => generateReport(userId, id, deps).catch(() => console.warn("report generation failed")));
    if (r.status === "ready") return NextResponse.json({ status: "ready", ...r.report });
    if (r.status === "pending") return NextResponse.json({ status: "pending" }, { status: 202, headers: { "Retry-After": "3" } });
    return NextResponse.json({ status: "failed", can_regenerate: r.can_regenerate });
  } catch (err) {
    return handleError(err);
  }
}
