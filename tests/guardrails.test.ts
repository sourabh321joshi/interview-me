import fs from "node:fs";
import { describe, expect, it } from "vitest";

const files = (dir: string) => (fs.readdirSync(dir, { recursive: true }) as string[]).filter((f) => /\.(ts|tsx)$/.test(f)).map((f) => `${dir}/${f}`);
const source = [...files("lib"), ...files("app")];
const read = (f: string) => fs.readFileSync(f, "utf-8");

describe("source guardrails (see AGENTS.md review guidelines)", () => {
  it("logs only fixed text, never variables that could hold content or secrets", () => {
    const bad: string[] = [];
    for (const f of source) {
      for (const m of read(f).matchAll(/console\.\w+\(([^)]*)\)/g)) if (!/^\s*"[^"]*"\s*$/.test(m[1])) bad.push(`${f}: ${m[0]}`);
    }
    expect(bad).toEqual([]);
  });

  it("has no NEXT_PUBLIC_ variables", () => {
    for (const f of [...source, ".env.example"]) expect(read(f), f).not.toContain("NEXT_PUBLIC_");
  });

  it("keeps server-only code out of client components", () => {
    const clients = source.filter((f) => read(f).trimStart().startsWith('"use client"'));
    expect(clients.length).toBeGreaterThan(0);
    for (const f of clients) expect(read(f), f).not.toMatch(/from "(@\/lib\/(db|llm|deps|[a-z-]*store)|mongodb|openai|node:[a-z]+)"/);
  });

  it("filters every user-data query by user_id", () => {
    let checked = 0;
    for (const f of ["lib/profiles-store.ts", "lib/interviews-store.ts", "lib/reports-store.ts", "lib/llm/usage-sink.ts"]) {
      const text = read(f);
      const literals = [
        ...text.matchAll(/(?:findOne|updateOne|findOneAndUpdate)\(\s*(\{[^}]*\})/g),
        ...text.matchAll(/const filter: Document = (\{[^}]*\})/g),
        ...text.matchAll(/[?:]\s*(\{ interview_id[^}]*\})/g),
      ];
      // app_users is keyed by the user id itself, so { _id: userId } is also an owner filter
      for (const m of literals) { checked++; expect(m[1], `${f}: ${m[1]}`).toMatch(/user_id|_id: userId/); }
    }
    expect(checked).toBeGreaterThanOrEqual(15);
  });
});
