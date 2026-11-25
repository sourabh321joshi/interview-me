import { expect, it, vi, afterEach } from "vitest";
import { POST } from "@/app/api/v1/voice-test/sample/route";

vi.mock("@/lib/auth", () => ({ getCurrentUserId: () => "owner" }));
vi.mock("@/lib/route-guard", () => ({ rateLimited: () => null }));
const request = (data: unknown) => new Request("http://localhost/api/v1/voice-test/sample", {
  method: "POST", headers: { origin: "http://localhost" }, body: JSON.stringify(data),
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
it("rejects arbitrary speech and only proxies the fixed voice sample", async () => {
  vi.stubEnv("DEEPGRAM_API_KEY", "fixture");
  const fetchMock = vi.fn().mockResolvedValue(new Response(new Uint8Array([1, 2, 3])));
  vi.stubGlobal("fetch", fetchMock);
  expect((await POST(request({ voice: "luna", text: "arbitrary" }))).status).toBe(400);
  expect(fetchMock).not.toHaveBeenCalled();
  const response = await POST(request({ voice: "luna" }));
  expect(response.headers.get("content-type")).toBe("audio/mpeg");
  expect(fetchMock.mock.calls[0][0].searchParams.get("model")).toBe("aura-2-luna-en");
  expect([...new Uint8Array(await response.arrayBuffer())]).toEqual([1, 2, 3]);
});
