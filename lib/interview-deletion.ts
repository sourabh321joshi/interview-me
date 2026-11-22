import { ObjectId } from "mongodb";
import { COLLECTIONS, getClientPromise, getDb } from "./db";

export async function deleteInterview(userId: string, id: string): Promise<boolean> {
  if (!/^[a-f0-9]{24}$/i.test(id)) return false;
  const interviewId = new ObjectId(id);
  const db = await getDb();
  const client = await getClientPromise();
  return client.withSession(session => session.withTransaction(async () => {
    const result = await db.collection(COLLECTIONS.interviews).deleteOne({ _id: interviewId, user_id: userId }, { session });
    if (result.deletedCount === 0) return false;
    await db.collection(COLLECTIONS.reports).deleteOne({ interview_id: interviewId, user_id: userId }, { session });
    return true;
  }));
}
