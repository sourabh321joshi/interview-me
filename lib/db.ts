import { MongoClient, type Db } from "mongodb";

declare global {
  // Cached across hot reloads and serverless invocations.
  var _mongoClientPromise: Promise<MongoClient> | undefined;
}

function getClientPromise(): Promise<MongoClient> {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not set");
  if (!globalThis._mongoClientPromise) {
    const client = new MongoClient(uri, { maxPoolSize: 5, serverSelectionTimeoutMS: 5000 });
    globalThis._mongoClientPromise = client.connect().catch((err) => {
      globalThis._mongoClientPromise = undefined; // allow retry after a failure
      throw err;
    });
  }
  return globalThis._mongoClientPromise;
}

export async function getDb(): Promise<Db> {
  const client = await getClientPromise();
  return client.db(process.env.MONGODB_DB ?? "interview_app");
}

export const COLLECTIONS = {
  app_users: "app_users",
  candidate_profiles: "candidate_profiles",
  interviews: "interviews",
  reports: "reports",
  usage_events: "usage_events",
  rate_limit_counters: "rate_limit_counters",
} as const;
