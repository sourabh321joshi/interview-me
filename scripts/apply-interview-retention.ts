import { ObjectId } from "mongodb";
import { COLLECTIONS, getDb } from "../lib/db";
import { interviewExpiry } from "../lib/retention";

async function main() {
  const apply = process.argv.includes("--apply");
  const db = await getDb();
  const interviews = db.collection<{ _id: ObjectId; user_id: string; ended_at: Date | null; ends_at: Date | null; expire_at?: Date | null }>(COLLECTIONS.interviews);
  const reports = db.collection(COLLECTIONS.reports);
  const now = new Date();
  let matched = 0;
  let due = 0;
  const legacy = interviews.find(
    { expire_at: null, $or: [{ ended_at: { $type: "date" } }, { ends_at: { $type: "date" } }] },
    { projection: { user_id: 1, ended_at: 1, ends_at: 1 } },
  );
  for await (const interview of legacy) {
    const endedAt = interview.ended_at ?? interview.ends_at;
    if (!endedAt) continue;
    const expire_at = interviewExpiry(endedAt);
    matched++;
    if (expire_at <= now) due++;
    if (apply) {
      await reports.updateOne(
        { interview_id: interview._id, user_id: interview.user_id, expire_at: null },
        { $set: { expire_at } },
      );
      await interviews.updateOne(
        { _id: interview._id, user_id: interview.user_id, expire_at: null },
        { $set: { expire_at } },
      );
    }
  }
  console.log(JSON.stringify({ applied: apply, matched, due }));
}

main().then(() => process.exit(0)).catch(() => {
  console.error("Could not backfill interview retention.");
  process.exit(1);
});
