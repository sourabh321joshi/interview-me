import { expect, it, vi } from "vitest";
import { POST } from "@/app/api/v1/profiles/manual/route";
import { SUMMARY } from "./helpers/fake-llm";

const mocks = vi.hoisted(() => ({ save: vi.fn(), user: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getCurrentUserId: mocks.user }));
vi.mock("@/lib/route-guard", () => ({ rateLimited: () => null }));
vi.mock("@/lib/consent", () => ({ consentRequired: () => null }));
vi.mock("@/lib/profiles-store", () => ({ saveManualProfile: mocks.save }));
const request = (summary: typeof SUMMARY) => new Request("http://localhost/api/v1/profiles/manual", {
  method: "POST", body: JSON.stringify({ summary, job_description: "Frontend role" }),
});
it("saves a usable manual profile for the signed-in owner", async () => {
  mocks.user.mockReturnValue("owner");
  mocks.save.mockResolvedValue("profile-id");
  expect((await POST(request(SUMMARY))).status).toBe(201);
  expect(mocks.save).toHaveBeenCalledWith("owner", expect.objectContaining({ skills: SUMMARY.skills }), "Frontend role");
});
it("rejects empty interview context", async () => {
  mocks.user.mockReturnValue("owner");
  expect((await POST(request({ ...SUMMARY, skills: [], projects: [], experience: [] }))).status).toBe(400);
});
