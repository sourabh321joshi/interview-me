import { COLLECTIONS, getDb } from "./db";
import { DomainError } from "./interview-service";

export type LimitName = "general" | "profiles";
// Defaults from api-design-v0.1.md, section 9. Override with the environment variables while testing.
const DEFAULTS = {
  general: { env: "RATE_GENERAL_PER_MINUTE", max: 60, windowMs: 60_000 },
  profiles: { env: "RATE_PROFILES_PER_DAY", max: 5, windowMs: 86_400_000 },
} as const;

export class RateLimitedError extends DomainError {
  constructor(public retryAfterSeconds: number) {
    super("rate_limited", "Too many requests. Please try again shortly.");
  }
}

export interface RateLimitStore {
  /** Adds one to the counter with this id and returns the new count. */
  hit(id: string, expireAt: Date): Promise<number>;
}

export function limitFor(name: LimitName, env: Record<string, string | undefined> = process.env) {
  const d = DEFAULTS[name];
  const v = Number.parseInt(env[d.env] ?? "", 10);
  return { max: Number.isFinite(v) && v > 0 ? v : d.max, windowMs: d.windowMs };
}

export function createMongoRateLimitStore(): RateLimitStore {
  const hit = async (id: string, expireAt: Date): Promise<number> => {
    const col = (await getDb()).collection<{ _id: string; count: number; expire_at: Date }>(COLLECTIONS.rate_limit_counters);
    const r = await col.findOneAndUpdate({ _id: id }, { $inc: { count: 1 }, $setOnInsert: { expire_at: expireAt } }, { upsert: true, returnDocument: "after" });
    return r?.count ?? 1;
  };
  return {
    async hit(id, expireAt) {
      try {
        return await hit(id, expireAt);
      } catch (err) {
        if ((err as { code?: number }).code === 11000) return hit(id, expireAt); // two first requests raced to create the counter
        throw err;
      }
    },
  };
}

let defaultStore: RateLimitStore | undefined;
export const setRateLimitStoreForTests = (s: RateLimitStore | undefined) => { defaultStore = s; };

// Fixed windows: one counter per user, limit name, and window. Old counters expire on their own (TTL index).
export async function enforceRateLimit(userId: string, name: LimitName, o: { store?: RateLimitStore; now?: () => number; env?: Record<string, string | undefined> } = {}) {
  const { max, windowMs } = limitFor(name, o.env);
  const now = (o.now ?? Date.now)();
  const windowStart = Math.floor(now / windowMs) * windowMs;
  const store = o.store ?? (defaultStore ??= createMongoRateLimitStore());
  const count = await store.hit(`${name}:${userId}:${windowStart}`, new Date(windowStart + windowMs * 2));
  if (count > max) throw new RateLimitedError(Math.max(1, Math.ceil((windowStart + windowMs - now) / 1000)));
}
