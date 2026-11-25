import { afterEach, expect, it, vi } from "vitest";
import { GET } from "@/app/api/v1/me/route";
import { consentPolicy } from "@/lib/consent";

const { session, findOne } = vi.hoisted(() => ({ session: vi.fn(), findOne: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getAuth: () => ({ api: { getSession: session } }) }));
vi.mock("@/lib/db", () => ({
  COLLECTIONS: { app_users: "app_users" },
  getDb: () => ({ collection: () => ({ findOne }) }),
}));
afterEach(() => { vi.resetAllMocks(); vi.unstubAllEnvs(); });
const request = () => GET(new Request("http://localhost/api/v1/me?user_id=someone-else"));

it("requires sign-in before reading account data", async () => {
  expect((await request()).status).toBe(401);
  expect(findOne).not.toHaveBeenCalled();
});

it("returns fresh-account defaults for the verified session", async () => {
  session.mockResolvedValue({ user: { id: "owner", name: "Riya" } });
  vi.stubEnv("FREE_INTERVIEW_LIMIT", "2");
  findOne.mockResolvedValue(null);
  expect(await (await request()).json()).toEqual({
    id: "owner", display_name: "Riya", free_interviews_remaining: 2, paid_credits: 0,
    consent: { required_version: consentPolicy().version, accepted_version: null },
  });
  expect(findOne).toHaveBeenCalledWith({ _id: "owner" });
});

it("reflects stored credits and only recognizes consent for the active processors", async () => {
  session.mockResolvedValue({ user: { id: "owner", name: "Riya" } });
  vi.stubEnv("FREE_INTERVIEW_LIMIT", "1");
  const { version, processors } = consentPolicy();
  const record = { display_name: "R", free_interviews_used: 3, paid_interview_credits: 2 };
  findOne.mockResolvedValueOnce({ ...record, consents: [{ version, processors: [] }] });
  expect((await (await request()).json()).consent.accepted_version).toBeNull();
  findOne.mockResolvedValueOnce({ ...record, consents: [{ version, processors }] });
  expect(await (await request()).json()).toMatchObject({
    display_name: "R", free_interviews_remaining: 0, paid_credits: 2, consent: { accepted_version: version },
  });
});
