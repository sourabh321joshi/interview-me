import { ObjectId } from "mongodb";
import { getDb } from "../lib/db";

// Local admin tool for the M0 checkpoint: prints one interview with its report and cost.
// It reads without a user filter on purpose. Never turn it into a route.
async function main() {
  const id = process.argv[2];
  if (!id || !ObjectId.isValid(id)) {
    console.error("Usage: npm run export:interview -- <interview id>");
    process.exit(1);
  }
  const db = await getDb();
  const _id = new ObjectId(id);
  const iv = await db.collection("interviews").findOne({ _id });
  if (!iv) {
    console.error("Interview not found");
    process.exit(1);
  }
  const report = await db.collection("reports").findOne({ interview_id: _id });
  const t = iv.usage_totals ?? {};
  console.log(`Interview ${id}: ${iv.role}, ${iv.level}, ${iv.duration_seconds / 60} min, status ${iv.status} (${iv.end_reason ?? "no end reason"})`);
  console.log(`Model calls: ${t.llm_input_tokens ?? 0} input tokens, ${t.llm_output_tokens ?? 0} output tokens, estimated cost $${(t.est_cost_usd ?? 0).toFixed(4)}`);
  console.log("\n--- Transcript ---");
  for (const turn of iv.turns ?? []) {
    const secs = Math.round(turn.t_offset_ms / 1000);
    console.log(`[${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}] ${turn.speaker === "interviewer" ? "Interviewer" : "Candidate"}: ${turn.text}`);
  }
  console.log("\n--- Report ---");
  console.log(report ? JSON.stringify({ status: report.status, error_code: report.error_code, attempts: report.attempts, scores: report.scores, summary: report.summary, top_fixes: report.details?.top_fixes }, null, 2) : "No report yet");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
