import { afterEach, expect, it, vi } from "vitest";
import { POST } from "@/app/api/v1/voice-test/token/route";

const { user, limit } = vi.hoisted(() => ({ user: vi.fn(), limit: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getCurrentUserId: user }));
vi.mock("@/lib/route-guard", () => ({ rateLimited: limit }));
const request = (origin = "http://localhost") => new Request("http://localhost/api/v1/voice-test/token", { method: "POST", headers: { origin } });
afterEach(() => { vi.resetAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
it("rejects unrelated origins and unsigned requests before issuing credentials", async () => {
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  expect((await POST(request("https://example.org"))).status).toBe(400);
  expect((await POST(request())).status).toBe(401);
  expect(fetch).not.toHaveBeenCalled();
});
it("only returns the temporary credential to an authenticated caller", async () => {
  user.mockResolvedValue("owner");
  vi.stubEnv("DEEPGRAM_API_KEY", "server-secret");
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ access_token: "temporary" })));
  const result = await POST(request());
  expect(limit).toHaveBeenCalledWith("owner", "general");
  expect(result.headers.get("cache-control")).toBe("no-store");
  expect(await result.json()).toEqual({ access_token: "temporary" });
});
