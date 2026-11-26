import { afterEach, expect, it, vi } from "vitest";
import { POST } from "@/app/api/v1/voice/tts/route";

const db = vi.hoisted(() => ({ findOne: vi.fn(), updateOne: vi.fn(), insertOne: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getCurrentUserId: () => "owner" }));
vi.mock("@/lib/route-guard", () => ({ rateLimited: () => null }));
vi.mock("@/lib/consent", () => ({ consentRequired: () => null }));
vi.mock("@/lib/db", () => ({ COLLECTIONS: {}, getDb: () => ({ collection: () => db }) }));
const request = () => new Request("http://localhost/api/v1/voice/tts", { method: "POST", headers: { origin: "http://localhost" },
  body: JSON.stringify({ interview_id: "0123456789abcdef01234567", seq: 1, text: "Your question?" }) });
afterEach(() => { vi.resetAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
it("only synthesizes stored questions with a reserved budget", async () => {
  vi.stubEnv("DEEPGRAM_API_KEY", "fixture");
  const call = vi.fn().mockResolvedValue(new Response("audio"));
  vi.stubGlobal("fetch", call);
  db.findOne.mockResolvedValueOnce(null).mockResolvedValue({ turns: [{ text: "Your question?" }] });
  expect((await POST(request())).status).toBe(409);
  expect(db.findOne.mock.calls[0][0]).toMatchObject({ user_id: "owner", mode: "voice", status: "in_progress" });
  db.updateOne.mockResolvedValueOnce({ modifiedCount: 0 }).mockResolvedValue({ modifiedCount: 1 });
  expect((await POST(request())).status).toBe(429);
  expect(call).not.toHaveBeenCalled();
  expect(await (await POST(request())).text()).toBe("audio");
  expect(db.insertOne).toHaveBeenCalledWith(expect.objectContaining({ model: "aura-2-luna-en", tts_characters: 14 }));
});
