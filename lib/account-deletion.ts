import { COLLECTIONS, getClientPromise, getDb } from "./db";

export async function deleteAccountData(userId: string) {
  const db = await getDb();
  const client = await getClientPromise();
  const owner = { user_id: userId };
  const escapedUserId = userId.replace(/[^0-9A-Za-z_]/g, char => "\\" + char);
  await client.withSession(session => session.withTransaction(async () => {
    await db.collection(COLLECTIONS.reports).deleteMany(owner, { session });
    await db.collection(COLLECTIONS.interviews).deleteMany(owner, { session });
    await db.collection(COLLECTIONS.candidate_profiles).deleteMany(owner, { session });
    await db.collection(COLLECTIONS.usage_events).updateMany(owner, { $set: { user_id: null, interview_id: null } }, { session });
    await db.collection<{ _id: string }>(COLLECTIONS.app_users).deleteOne({ _id: userId }, { session });
    await db.collection<{ _id: string }>(COLLECTIONS.rate_limit_counters).deleteMany(
      { _id: { $regex: `^(general|profiles):${escapedUserId}:[0-9]+$` } },
      { session },
    );
  }));
}
