import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { apiError } from "@/lib/api-error";


export async function GET() {
  try {
    const db = await getDb();
    await db.command({ ping: 1 });
    return NextResponse.json({ status: "ok", time: new Date().toISOString() });
  } catch {
    return apiError("upstream_unavailable", "Database is not reachable.", { retryable: true });
  }
}
