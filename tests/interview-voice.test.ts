import { beforeEach, expect, it, vi } from "vitest";
import { POST } from "@/app/api/v1/voice/stt-token/route";

const mocks = vi.hoisted(() => ({ interview: vi.fn(), hit: vi.fn(), grant: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getCurrentUserId: () => "owner" }));
vi.mock("@/lib/route-guard", () => ({ rateLimited: () => null }));
vi.mock("@/lib/consent", () => ({ consentRequired: () => null }));
vi.mock("@/lib/interviews-store", () => ({ createMongoInterviewsStore: () => ({ findOwned: mocks.interview }) }));
vi.mock("@/lib/rate-limit", () => ({ createMongoRateLimitStore: () => ({ hit: mocks.hit }) }));
vi.mock("@/lib/deepgram-token", () => ({ deepgramToken: mocks.grant }));
const id = "0123456789abcdef01234567";
const call = () => POST(new Request("http://localhost/api/v1/voice/stt-token", {
  method: "POST", headers: { origin: "http://localhost" }, body: JSON.stringify({ interview_id: id }),
}));
beforeEach(() => {
  vi.resetAllMocks();
  mocks.interview.mockResolvedValue({ id, status: "in_progress", ends_at: new Date(Date.now() + 60000) });
  mocks.hit.mockResolvedValue(1);
  mocks.grant.mockResolvedValue(Response.json({ access_token: "temporary" }));
});
it("requires the interview to belong to the session owner", async () => {
  mocks.interview.mockResolvedValue(null);
  expect((await call()).status).toBe(404);
  expect(mocks.interview).toHaveBeenCalledWith("owner", id);
  expect(mocks.grant).not.toHaveBeenCalled();
});
it("rejects completed and expired interviews before requesting a grant", async () => {
  mocks.interview.mockResolvedValueOnce({ status: "completed" }).mockResolvedValueOnce({ status: "in_progress", ends_at: new Date(0) });
  expect((await call()).status).toBe(409);
  expect((await call()).status).toBe(410);
  expect(mocks.grant).not.toHaveBeenCalled();
});
it("allows the fifth grant and rejects the sixth", async () => {
  mocks.hit.mockResolvedValueOnce(5).mockResolvedValueOnce(6);
  expect((await call()).status).toBe(200);
  expect((await call()).status).toBe(429);
  expect(mocks.grant).toHaveBeenCalledTimes(1);
});
