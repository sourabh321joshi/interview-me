import { ObjectId } from "mongodb";
import { COLLECTIONS, getDb } from "./db";
import type { GithubSummary, ProfileSummary } from "./schemas";

export type ProfileStatus = "processing" | "ready" | "failed";
export type ProfileDoc = {
  id: string; user_id: string; status: ProfileStatus; summary: ProfileSummary | null; github_username: string | null;
  github_summary: GithubSummary | null; job_description: string | null; error_code: string | null; created_at: Date; updated_at: Date;
};
export type NewProfile = Pick<ProfileDoc, "user_id" | "github_username" | "job_description">;

export interface ProfilesStore {
  insert(doc: NewProfile): Promise<string>;
  findOwned(userId: string, id: string): Promise<ProfileDoc | null>;
  markReady(userId: string, id: string, data: { summary: ProfileSummary; github_summary: GithubSummary | null }): Promise<void>;
  markFailed(userId: string, id: string, errorCode: string): Promise<void>;
  patchSummary(userId: string, id: string, patch: Partial<ProfileSummary>): Promise<ProfileDoc | null>;
}

type Raw = Omit<ProfileDoc, "id"> & { _id: ObjectId };
const toDoc = ({ _id, ...rest }: Raw): ProfileDoc => ({ id: _id.toString(), ...rest });
const oid = (id: string) => (ObjectId.isValid(id) ? new ObjectId(id) : null);

export function createMongoProfilesStore(): ProfilesStore {
  const col = async () => (await getDb()).collection<Raw>(COLLECTIONS.candidate_profiles);
  return {
    async insert(doc) {
      const now = new Date();
      const r = await (await col()).insertOne({ ...doc, status: "processing", summary: null, github_summary: null, error_code: null, created_at: now, updated_at: now, schema_version: 1 } as unknown as Raw);
      return r.insertedId.toString();
    },
    async findOwned(userId, id) {
      const _id = oid(id);
      if (!_id) return null;
      const d = await (await col()).findOne({ _id, user_id: userId });
      return d ? toDoc(d) : null;
    },
    async markReady(userId, id, data) {
      const _id = oid(id);
      if (_id) await (await col()).updateOne({ _id, user_id: userId }, { $set: { status: "ready", ...data, updated_at: new Date() } });
    },
    async markFailed(userId, id, errorCode) {
      const _id = oid(id);
      if (_id) await (await col()).updateOne({ _id, user_id: userId }, { $set: { status: "failed", error_code: errorCode, updated_at: new Date() } });
    },
    async patchSummary(userId, id, patch) {
      const _id = oid(id);
      if (!_id) return null;
      const set = Object.fromEntries(Object.entries(patch).map(([k, v]) => [`summary.${k}`, v]));
      const d = await (await col()).findOneAndUpdate({ _id, user_id: userId, status: "ready" }, { $set: { ...set, updated_at: new Date() } }, { returnDocument: "after" });
      return d ? toDoc(d) : null;
    },
  };
}

export async function saveManualProfile(userId: string, summary: ProfileSummary, jobDescription: string) {
  const now = new Date();
  const result = await (await getDb()).collection(COLLECTIONS.candidate_profiles).insertOne({
    user_id: userId, status: "ready", summary, job_description: jobDescription || null,
    github_username: null, github_summary: null, error_code: null, schema_version: 1,
    created_at: now, updated_at: now,
  });
  return result.insertedId.toString();
}
