import { ObjectId } from "mongodb";
import { COLLECTIONS, getClientPromise, getDb } from "../lib/db";
import { estimateCostUsd, getPrices } from "../lib/llm/pricing";
import type { Usage } from "../lib/llm/types";
import { voiceCostUsd } from "../lib/voice-usage";

type Event = Partial<Usage> & {
  kind: "llm" | "stt" | "tts";
  model: string;
  role?: string;
  duration_source?: string;
  stt_seconds?: number;
  tts_characters?: number;
};

let connected = false;

async function main() {
  const id = process.argv[2];
  if (!id || !/^[a-f\d]{24}$/i.test(id)) throw new Error("Usage: npm run cost:interview -- <interview id>");
  const db = await getDb();
  connected = true;
  const _id = new ObjectId(id);
  const interview = await db.collection(COLLECTIONS.interviews).findOne({ _id }, { projection: { duration_seconds: 1, status: 1 } });
  if (!interview) throw new Error("Interview not found.");
  const events = await db.collection<Event>(COLLECTIONS.usage_events).find(
    { interview_id: _id, kind: { $in: ["llm", "stt", "tts"] } },
    { projection: { _id: 0, kind: 1, model: 1, role: 1, duration_source: 1, input_tokens: 1, cached_input_tokens: 1, output_tokens: 1, stt_seconds: 1, tts_characters: 1 } },
  ).toArray();
  console.log(interview.duration_seconds / 60 + "-minute interview (" + interview.status + ")");
  if (!events.length) { console.log("No usage recorded."); return; }

  const prices = getPrices();
  const totals = new Map<string, { calls: number; input: number; output: number; units: number; priced: boolean; cost: number; estimatedSeconds: number }>();
  for (const e of events) {
    const label = e.kind + " " + e.model + (e.kind === "llm" && e.role ? " (" + e.role + ")" : "");
    const bucket = totals.get(label) ?? { calls: 0, input: 0, output: 0, units: 0, priced: true, cost: 0, estimatedSeconds: 0 };
    const usage: Usage = { input_tokens: e.input_tokens ?? 0, cached_input_tokens: e.cached_input_tokens ?? 0, output_tokens: e.output_tokens ?? 0 };
    const units = e.kind === "stt" ? e.stt_seconds ?? 0 : e.tts_characters ?? 0;
    const cost = e.kind === "llm" ? (prices[e.model] ? estimateCostUsd(e.model, usage, prices) : null) : voiceCostUsd(e.kind, units);
    bucket.calls++;
    bucket.input += usage.input_tokens;
    bucket.output += usage.output_tokens;
    bucket.units += units;
    bucket.priced &&= cost !== null;
    bucket.cost += cost ?? 0;
    if (e.kind === "stt" && e.duration_source === "client_estimate") bucket.estimatedSeconds += units;
    totals.set(label, bucket);
  }

  let unpriced = false;
  let total = 0;
  for (const [label, entry] of totals) {
    const units = label.startsWith("llm ") ? entry.input + " input / " + entry.output + " output tokens" :
      label.startsWith("stt ") ? entry.units.toFixed(2) + " audio seconds (" + entry.estimatedSeconds.toFixed(2) + " estimated locally)" :
        entry.units + " characters";
    console.log(label + " · " + entry.calls + " calls · " + units + " · " + (entry.priced ? "$" + entry.cost.toFixed(5) : "rate not configured"));
    unpriced ||= !entry.priced;
    total += entry.cost;
  }
  console.log((unpriced ? "Partial estimate for priced usage" : "Estimated cost for recorded usage") + " $" + total.toFixed(5));
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : "Could not read interview usage.");
  process.exitCode = 1;
}).finally(async () => {
  if (connected) await getClientPromise().then(client => client.close(), () => {});
});
