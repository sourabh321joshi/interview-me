import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { POST } from "@/app/api/v1/voice/stt-usage/route";
import { voiceCostUsd, voiceUsageReceipt } from "@/lib/voice-usage";

const mocks = vi.hoisted(() => ({ user: "owner", tally: vi.fn(), event: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getCurrentUserId: () => mocks.user }));
vi.mock("@/lib/route-guard", () => ({ rateLimited: () => null }));
vi.mock("@/lib/db", () => ({
  COLLECTIONS: { interviews: "interviews", usage_events: "usage_events" },
  getDb: () => ({ collection: () => ({ updateOne: mocks.tally, insertOne: mocks.event }) }),
  getClientPromise: () => ({ withSession: (run: (session: object) => unknown) => run({ withTransaction: (fn: () => unknown) => fn() }) }),
}));

const interview_id = "0123456789abcdef01234567";
const request = (data: object) => POST(new Request("http://localhost/api/v1/voice/stt-usage", {
  method: "POST", headers: { origin: "http://localhost" }, body: JSON.stringify(data),
}));
beforeEach(() => {
  mocks.user = "owner";
  vi.resetAllMocks();
  vi.stubEnv("BETTER_AUTH_SECRET", "voice-test-fixture");
  vi.stubEnv("DEEPGRAM_STT_USD_PER_MINUTE", "0.01");
});
afterEach(() => vi.unstubAllEnvs());

it("counts an owned grant once and rejects a foreign or oversized usage report", async () => {
  const receipt = voiceUsageReceipt("owner", interview_id)!;
  const body = { ...receipt, interview_id, seconds: 30, source: "provider_metadata" };
  mocks.user = "another-account";
  expect((await request(body)).status).toBe(400);
  mocks.user = "owner";
  expect((await request({ ...body, seconds: 61 })).status).toBe(400);
  expect(mocks.tally).not.toHaveBeenCalled();
  mocks.tally.mockResolvedValueOnce({ modifiedCount: 1 }).mockResolvedValueOnce({ modifiedCount: 0 });
  expect((await request(body)).status).toBe(204);
  expect((await request(body)).status).toBe(204);
  expect(mocks.tally).toHaveBeenCalledWith(
    expect.objectContaining({ user_id: "owner", stt_usage_receipts: { $ne: receipt.id } }),
    expect.objectContaining({ $inc: { "usage_totals.stt_seconds": 30, "usage_totals.est_cost_usd": 0.005 } }),
    expect.anything(),
  );
  expect(mocks.event).toHaveBeenCalledTimes(1);
  expect(mocks.event).toHaveBeenCalledWith(expect.objectContaining({
    kind: "stt", stt_seconds: 30, duration_source: "provider_metadata", est_cost_usd: 0.005,
  }), expect.anything());
});

it("keeps missing prices distinct from a configured zero rate", () => {
  expect(voiceCostUsd("tts", 1000, {})).toBeNull();
  expect(voiceCostUsd("tts", 1000, { DEEPGRAM_TTS_USD_PER_1M_CHARACTERS: "0" })).toBe(0);
  expect(voiceCostUsd("tts", 1000, { DEEPGRAM_TTS_USD_PER_1M_CHARACTERS: "30" })).toBe(0.03);
});
