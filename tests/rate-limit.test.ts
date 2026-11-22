import { describe, expect, it } from "vitest";
import { enforceRateLimit, limitFor, RateLimitedError } from "@/lib/rate-limit";
import { memoryRateStore } from "./helpers/memory-rate";

const T = Date.UTC(2026, 10, 14, 10, 0, 20); // 20 seconds into a minute

describe("rate limiting", () => {
  it("allows up to the limit, then rejects with a retry time", async () => {
    const store = memoryRateStore();
    const o = { store, now: () => T, env: { RATE_GENERAL_PER_MINUTE: "3" } };
    for (let i = 0; i < 3; i++) await enforceRateLimit("u1", "general", o);
    const err = await enforceRateLimit("u1", "general", o).catch((e) => e);
    expect(err).toBeInstanceOf(RateLimitedError);
    expect(err).toMatchObject({ code: "rate_limited", retryAfterSeconds: 40 });
  });
  it("starts fresh in the next window", async () => {
    const store = memoryRateStore();
    const env = { RATE_GENERAL_PER_MINUTE: "1" };
    await enforceRateLimit("u1", "general", { store, now: () => T, env });
    await expect(enforceRateLimit("u1", "general", { store, now: () => T, env })).rejects.toBeInstanceOf(RateLimitedError);
    await expect(enforceRateLimit("u1", "general", { store, now: () => T + 60_000, env })).resolves.toBeUndefined();
  });
  it("keeps users and limit names separate", async () => {
    const store = memoryRateStore();
    const env = { RATE_GENERAL_PER_MINUTE: "1", RATE_PROFILES_PER_DAY: "1" };
    await enforceRateLimit("u1", "general", { store, now: () => T, env });
    await expect(enforceRateLimit("u2", "general", { store, now: () => T, env })).resolves.toBeUndefined();
    await expect(enforceRateLimit("u1", "profiles", { store, now: () => T, env })).resolves.toBeUndefined();
  });
  it("uses the documented defaults and ignores bad overrides", () => {
    expect(limitFor("general", {})).toEqual({ max: 60, windowMs: 60_000 });
    expect(limitFor("profiles", {})).toEqual({ max: 5, windowMs: 86_400_000 });
    expect(limitFor("general", { RATE_GENERAL_PER_MINUTE: "abc" }).max).toBe(60);
    expect(limitFor("general", { RATE_GENERAL_PER_MINUTE: "0" }).max).toBe(60);
  });
});
