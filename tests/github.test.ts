import { describe, expect, it } from "vitest";
import { fetchGithubRepos } from "@/lib/github";
import { fakeFetch } from "./helpers/fake-llm";

const repo = (name: string, extra = {}) => ({ name, description: "d", language: "JavaScript", pushed_at: "2026-10-01T00:00:00Z", fork: false, archived: false, ...extra });
const repos = [repo("a"), repo("fork", { fork: true }), repo("old", { archived: true }), repo("b"), repo("c"), repo("d"), repo("e"), repo("f")];

describe("fetchGithubRepos", () => {
  it("returns at most 5 original repos and truncates READMEs", async () => {
    const f = fakeFetch({ "/readme": { text: "x".repeat(9000) }, "/repos?": { json: repos } });
    const r = await fetchGithubRepos("riya-dev", { fetchImpl: f });
    expect(r.ok && r.repos.map((x) => x.name)).toEqual(["a", "b", "c", "d", "e"]);
    expect(r.ok && r.repos[0].readme.length).toBe(6000);
  });
  it("tolerates a missing README", async () => {
    const f = fakeFetch({ "/readme": { status: 404 }, "/repos?": { json: [repo("a")] } });
    const r = await fetchGithubRepos("riya-dev", { fetchImpl: f });
    expect(r.ok && r.repos[0].readme).toBe("");
  });
  it("maps failures to warnings", async () => {
    expect(await fetchGithubRepos("riya-dev", { fetchImpl: fakeFetch({ "/repos?": { status: 404 } }) })).toEqual({ ok: false, warning: "github_not_found" });
    expect(await fetchGithubRepos("riya-dev", { fetchImpl: fakeFetch({ "/repos?": { status: 403 } }) })).toEqual({ ok: false, warning: "github_rate_limited" });
    const boom = (async () => { throw new Error("network"); }) as unknown as typeof fetch;
    expect(await fetchGithubRepos("riya-dev", { fetchImpl: boom })).toEqual({ ok: false, warning: "github_unavailable" });
  });
  it("rejects an invalid username without calling GitHub", async () => {
    let called = false;
    const f = (async () => { called = true; return new Response("{}"); }) as unknown as typeof fetch;
    expect(await fetchGithubRepos("bad name/../x", { fetchImpl: f })).toEqual({ ok: false, warning: "github_not_found" });
    expect(called).toBe(false);
  });
});
