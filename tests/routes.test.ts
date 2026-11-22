/* eslint-disable @typescript-eslint/no-explicit-any */
import fs from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ZodType } from "zod";
import { setRateLimitStoreForTests } from "@/lib/rate-limit";
import { LlmError } from "@/lib/llm";
import { GET as getInterview } from "@/app/api/v1/interviews/[id]/route";
import { POST as postStart } from "@/app/api/v1/interviews/[id]/start/route";
import { POST as postTurns } from "@/app/api/v1/interviews/[id]/turns/route";
import { POST as postEnd } from "@/app/api/v1/interviews/[id]/end/route";
import { GET as getReport } from "@/app/api/v1/interviews/[id]/report/route";
import { POST as postRegenerate } from "@/app/api/v1/interviews/[id]/report/regenerate/route";
import { POST as postInterviews } from "@/app/api/v1/interviews/route";
import { GET as getProfile, PATCH as patchProfile } from "@/app/api/v1/profiles/[id]/route";
import { POST as postProfiles } from "@/app/api/v1/profiles/route";
import { SUMMARY } from "./helpers/fake-llm";
import { memoryInterviews, memoryUsers } from "./helpers/memory-interviews";
import { memoryRateStore } from "./helpers/memory-rate";
import { memoryReports } from "./helpers/memory-reports";
import { memoryStore } from "./helpers/memory-store";
import { PLAN } from "./helpers/turn-setup";

const state = vi.hoisted(() => ({ user: "u1", w: null as any }));
vi.mock("@/lib/auth", () => ({ getCurrentUserId: () => state.user, DEV_USER_ID: "dev-user-1" }));
vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), after: (fn: () => unknown) => { state.w.pending.push(Promise.resolve().then(fn)); } }));
vi.mock("@/lib/deps", () => ({
  interviewDeps: () => ({ interviews: state.w.interviews, users: state.w.users, profiles: state.w.profiles, llm: state.w.llm, models: () => ({ plan: "m", turn: "m", report: "m" }), freeLimit: 5 }),
  reportDeps: () => ({ interviews: state.w.interviews, reports: state.w.reports, llm: state.w.llm, model: () => "m" }),
}));
vi.mock("@/lib/profiles-store", async (orig) => ({ ...(await orig<typeof import("@/lib/profiles-store")>()), createMongoProfilesStore: () => state.w.profiles }));
vi.mock("@/lib/llm", async (orig) => ({ ...(await orig<typeof import("@/lib/llm")>()), getLlm: () => state.w.llm }));

const A1 = "I used Socket.IO because it handles reconnection for me";
const A2 = "A closure remembers variables from its outer scope";
const dim = (score: number | null, quote?: string) => ({ score, rationale: "ok", evidence: quote ? [{ quote, note: "n" }] : [] });
const REPORT = {
  summary: "Good.", strengths: ["Clear"], suggested_practice: ["p"], limitations: "short",
  scores: { problem_solving: dim(3, "I used Socket.IO because it handles reconnection"), technical_depth: dim(3, "it handles reconnection for me"), fundamentals: dim(null), communication: dim(4, "A closure remembers variables") },
  top_fixes: [1, 2, 3].map(() => ({ title: "t", why_it_matters: "w", evidence_quote: A2, how_to_improve: "h" })),
};

function makeWorld(turnScript: Array<Array<string | Error>>, failReport = false) {
  const script = [...turnScript];
  const data: Record<string, unknown> = { profile: SUMMARY, plan: JSON.parse(PLAN), report: REPORT };
  return {
    profiles: memoryStore(), interviews: memoryInterviews(), users: memoryUsers(), reports: memoryReports(), pending: [] as Promise<void>[],
    llm: {
      async generateJson(role: string, schema: ZodType<unknown>) {
        if (role === "report" && failReport) throw new LlmError("upstream_unavailable", `failed ${A1} sk-test-secret-123`);
        return schema.parse(data[role]);
      },
      async *streamTurn() { for (const c of script.shift() ?? ["Ok."]) { if (c instanceof Error) throw c; yield c; } },
    },
  };
}

const params = (id: string) => ({ params: Promise.resolve({ id }) });
const req = (url: string, body?: object, method = "POST") => new Request(`http://localhost${url}`, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
const pdfRequest = () => {
  const f = new FormData();
  f.set("resume", new File([fs.readFileSync("tests/fixtures/resume.pdf")], "resume.pdf", { type: "application/pdf" }));
  return new Request("http://localhost/api/v1/profiles", { method: "POST", body: f });
};
async function turn(id: string, body: object) {
  const res = await postTurns(req(`/api/v1/interviews/${id}/turns`, { client_turn_id: crypto.randomUUID(), ...body }), params(id));
  return { status: res.status, text: await res.text() };
}

async function runInterview() {
  state.user = "u1";
  const profile = await (await postProfiles(pdfRequest())).json();
  const created = await postInterviews(req("/api/v1/interviews", { profile_id: profile.id, role: "frontend", level: "fresher", duration_seconds: 300 }));
  const iv = await created.json();
  const started = await postStart(req(`/api/v1/interviews/${iv.id}/start`), params(iv.id));
  await turn(iv.id, { type: "open" });
  await turn(iv.id, { type: "answer", text: A1 });
  await turn(iv.id, { type: "answer", text: A2 });
  const ended = await postEnd(req(`/api/v1/interviews/${iv.id}/end`), params(iv.id));
  await Promise.all(state.w.pending);
  return { profileId: profile.id as string, id: iv.id as string, statuses: [created.status, started.status, ended.status] };
}

beforeEach(() => { state.w = makeWorld([["Hi."], ["Why?"], ["Thanks."]]); setRateLimitStoreForTests(memoryRateStore()); });
afterEach(() => { vi.restoreAllMocks(); delete process.env.RATE_GENERAL_PER_MINUTE; delete process.env.RATE_PROFILES_PER_DAY; });

describe("routes", () => {
  it("run a whole interview for the owner", async () => {
    const { id, statuses } = await runInterview();
    expect(statuses).toEqual([201, 200, 202]);
    const report = await getReport(req(`/api/v1/interviews/${id}/report`, undefined, "GET"), params(id));
    expect(await report.json()).toMatchObject({ status: "ready", summary: "Good." });
    const view = await (await getInterview(req(`/api/v1/interviews/${id}`, undefined, "GET"), params(id))).json();
    expect(view.turns).toHaveLength(5);
  });

  it("return 404 for another user on every route and change nothing", async () => {
    const { id, profileId } = await runInterview();
    const before = JSON.stringify([...state.w.interviews.docs.values()]) + JSON.stringify([...state.w.reports.docs.values()]) + JSON.stringify([...state.w.profiles.docs.values()]);
    state.user = "u2";
    const calls: Array<[string, () => Promise<Response>]> = [
      ["GET profile", () => getProfile(req(`/api/v1/profiles/${profileId}`, undefined, "GET"), params(profileId))],
      ["PATCH profile", () => patchProfile(req(`/api/v1/profiles/${profileId}`, { first_name: "X" }, "PATCH"), params(profileId))],
      ["create interview from their profile", () => postInterviews(req("/api/v1/interviews", { profile_id: profileId, role: "frontend", level: "fresher", duration_seconds: 300 }))],
      ["GET interview", () => getInterview(req(`/api/v1/interviews/${id}`, undefined, "GET"), params(id))],
      ["start", () => postStart(req(`/api/v1/interviews/${id}/start`), params(id))],
      ["turns", () => postTurns(req(`/api/v1/interviews/${id}/turns`, { client_turn_id: crypto.randomUUID(), type: "answer", text: "hello there" }), params(id))],
      ["end", () => postEnd(req(`/api/v1/interviews/${id}/end`), params(id))],
      ["GET report", () => getReport(req(`/api/v1/interviews/${id}/report`, undefined, "GET"), params(id))],
      ["regenerate", () => postRegenerate(req(`/api/v1/interviews/${id}/report/regenerate`), params(id))],
    ];
    for (const [name, call] of calls) {
      const res = await call();
      expect([name, res.status, (await res.json()).error?.code]).toEqual([name, 404, "not_found"]);
    }
    await Promise.all(state.w.pending);
    const after = JSON.stringify([...state.w.interviews.docs.values()]) + JSON.stringify([...state.w.reports.docs.values()]) + JSON.stringify([...state.w.profiles.docs.values()]);
    expect(after).toBe(before);
  });

  it("rate limit per user, with a Retry-After header", async () => {
    process.env.RATE_GENERAL_PER_MINUTE = "2";
    state.user = "u3";
    const call = () => getInterview(req("/api/v1/interviews/abc", undefined, "GET"), params("abc"));
    expect((await call()).status).toBe(404);
    expect((await call()).status).toBe(404);
    const res = await call();
    expect(res.status).toBe(429);
    expect(Number(res.headers.get("Retry-After"))).toBeGreaterThan(0);
    expect((await res.json()).error.code).toBe("rate_limited");
    state.user = "u4";
    expect((await call()).status).toBe(404); // a different user is unaffected
  });

  it("limit profile builds per day", async () => {
    process.env.RATE_PROFILES_PER_DAY = "1";
    expect((await postProfiles(pdfRequest())).status).toBe(201);
    const res = await postProfiles(pdfRequest());
    expect(res.status).toBe(429);
  });
});

describe("logging and error bodies", () => {
  it("never include secrets, resume text, or transcript text, even when providers fail", async () => {
    process.env.OPENAI_API_KEY = "sk-test-secret-123";
    process.env.MONGODB_URI = "mongodb+srv://user:pw-secret-456@cluster.example.net/x";
    state.w = makeWorld([["Hi."], [new Error(`provider failed sk-test-secret-123 ${A1}`)]], true);
    const spies = (["log", "info", "warn", "error", "debug"] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => {}));
    const profile = await (await postProfiles(pdfRequest())).json();
    const iv = await (await postInterviews(req("/api/v1/interviews", { profile_id: profile.id, role: "frontend", level: "fresher", duration_seconds: 300 }))).json();
    await postStart(req(`/api/v1/interviews/${iv.id}/start`), params(iv.id));
    await turn(iv.id, { type: "open" });
    const failed = await turn(iv.id, { type: "answer", text: A1 });
    await turn(iv.id, { type: "answer", text: A2 }); // retry path with a fresh script: second interviewer reply
    await postEnd(req(`/api/v1/interviews/${iv.id}/end`), params(iv.id));
    await Promise.all(state.w.pending);
    const report = await getReport(req(`/api/v1/interviews/${iv.id}/report`, undefined, "GET"), params(iv.id));

    expect(failed.text).toContain("event: error"); // the failure was real
    const logged = JSON.stringify(spies.map((s) => s.mock.calls));
    const bodies = failed.text + JSON.stringify(await report.json());
    for (const secret of ["sk-test-secret-123", "pw-secret-456", A1, "Riya", "TaskFlow"]) {
      expect(logged).not.toContain(secret);
      expect(bodies).not.toContain(secret);
    }
  });
});
