import { apiError } from "./api-error";
import { COLLECTIONS, getDb } from "./db";
import { createMongoUsersStore } from "./interviews-store";

export const CONSENT_VERSION = "2026-11-v2";

export function consentPolicy() {
  const provider = process.env.LLM_PROVIDER === "gemini" ? "Google Gemini" : "OpenAI";
  return { version: CONSENT_VERSION, provider, processors: [provider, "GitHub API", "MongoDB Atlas"] };
}

type ConsentRecord = { version: string; processors: string[]; accepted_at: Date };
const users = async () => (await getDb()).collection<{ _id: string; consents: ConsentRecord[] }>(COLLECTIONS.app_users);

export async function hasCurrentConsent(userId: string) {
  const { version, processors } = consentPolicy();
  const accepted = await (await users()).findOne(
    { _id: userId, consents: { $elemMatch: { version, processors } } },
    { projection: { _id: 1 } },
  );
  return accepted !== null;
}

export async function acceptConsent(userId: string, version: string, processors: string[]) {
  await createMongoUsersStore().ensureUser(userId);
  await (await users()).updateOne(
    { _id: userId, consents: { $not: { $elemMatch: { version, processors } } } },
    { $push: { consents: { version, processors, accepted_at: new Date() } } },
  );
}

export async function consentRequired(userId: string) {
  return await hasCurrentConsent(userId) ? null : apiError("consent_required", "Review and accept the data terms before continuing.");
}
