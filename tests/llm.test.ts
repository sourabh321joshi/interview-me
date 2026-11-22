import OpenAI from "openai";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createLlm, getModel, LlmError, type LlmProvider, type LlmRequest, type UsageEvent } from "@/lib/llm";
import { createOpenAiProvider } from "@/lib/llm/openai-provider";
import { estimateCostUsd } from "@/lib/llm/pricing";
import { buildUsageInc } from "@/lib/llm/usage-sink";

const usage = { input_tokens: 100, output_tokens: 20, cached_input_tokens: 40 };

function setup(script: Array<string | Error>) {
  const calls: LlmRequest[] = [];
  const events: UsageEvent[] = [];
  const next = (req: LlmRequest) => {
    calls.push(req);
    const item = script.shift();
    if (item instanceof Error) throw item;
    return item ?? "";
  };
  const provider: LlmProvider = {
    name: "fake",
    async generate(req) { return { text: next(req), usage }; },
    async *stream(req) {
      for (const w of next(req).split(" ")) yield { type: "delta", text: w };
      yield { type: "done", usage };
    },
  };
  let t = 0;
  const llm = createLlm({
    provider,
    sink: { async record(e) { events.push(e); } },
    models: () => "test-model",
    prices: { "test-model": { input: 1, output: 2, cached_input: 0.5 } },
    now: () => (t += 50),
  });
  return { llm, calls, events };
}

const schema = z.object({ ok: z.boolean() });
const input = { system: "s", messages: [{ role: "user" as const, content: "go" }], ctx: { user_id: "u1", interview_id: "507f1f77bcf86cd799439011" } };

describe("generateJson", () => {
  it("accepts fenced JSON", async () => {
    const { llm } = setup(['```json\n{"ok":true}\n```']);
    expect(await llm.generateJson("plan", schema, input)).toEqual({ ok: true });
  });

  it("retries once with validation errors, then succeeds, logging both calls", async () => {
    const { llm, calls, events } = setup(["not json", '{"ok":true}']);
    expect(await llm.generateJson("report", schema, input)).toEqual({ ok: true });
    expect(calls).toHaveLength(2);
    expect(calls[1].messages.at(-1)?.content).toContain("not valid JSON");
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({ role: "report", model: "test-model", user_id: "u1", latency_ms: 50 });
  });

  it("fails cleanly after the retry and still logs usage", async () => {
    const { llm, events } = setup(['{"ok":1}', '{"ok":2}']);
    await expect(llm.generateJson("plan", schema, input)).rejects.toMatchObject({ code: "invalid_output" });
    expect(events).toHaveLength(2);
  });

  it("retries a transient provider error once, but not a permanent one", async () => {
    const a = setup([new LlmError("upstream_unavailable", "x", true), '{"ok":true}']);
    expect(await a.llm.generateJson("plan", schema, input)).toEqual({ ok: true });
    expect(a.calls).toHaveLength(2);
    const b = setup([new LlmError("upstream_unavailable", "x", false)]);
    await expect(b.llm.generateJson("plan", schema, input)).rejects.toMatchObject({ code: "upstream_unavailable" });
    expect(b.calls).toHaveLength(1);
  });
});

describe("streamTurn", () => {
  it("streams deltas and logs usage with cost", async () => {
    const { llm, events } = setup(["Hello there friend"]);
    let out = "";
    for await (const d of llm.streamTurn(input)) out += d;
    expect(out).toBe("Hellotherefriend");
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ role: "turn", input_tokens: 100, cached_input_tokens: 40 });
    expect(events[0].est_cost_usd).toBeCloseTo(0.00012, 8);
  });

  it("retries once if the stream fails before any text", async () => {
    const { llm, calls } = setup([new LlmError("upstream_unavailable", "x", true), "Hi"]);
    let out = "";
    for await (const d of llm.streamTurn(input)) out += d;
    expect(out).toBe("Hi");
    expect(calls).toHaveLength(2);
  });
});

describe("config, pricing, usage totals", () => {
  it("requires a model per role and falls back for profile", () => {
    expect(() => getModel("plan", {})).toThrow(/not configured/);
    expect(getModel("profile", { MODEL_TURN: "m" })).toBe("m");
  });
  it("estimates zero for unknown models", () => {
    expect(estimateCostUsd("unknown", usage, {})).toBe(0);
  });
  it("builds the interview usage increment", () => {
    const inc = buildUsageInc({ provider: "p", role: "turn", model: "m", ...usage, latency_ms: 1, est_cost_usd: 0.5 });
    expect(inc).toEqual({ "usage_totals.llm_input_tokens": 100, "usage_totals.llm_output_tokens": 20, "usage_totals.est_cost_usd": 0.5 });
  });
});

it("includes a JSON instruction in the Responses API input for JSON mode", async () => {
  const client = new OpenAI({ apiKey: "test-key" });
  const create = vi.spyOn(client.responses, "create").mockRejectedValue(new Error("stop before network"));
  const provider = createOpenAiProvider(client);
  const messages = [{ role: "user" as const, content: "<data>Example resume</data>" }];

  await expect(provider.generate({
    model: "test-model", system: "Extract the profile.", messages, json: true, timeoutMs: 1000,
  })).rejects.toThrow("OpenAI request failed");

  expect(create).toHaveBeenCalledWith(expect.objectContaining({
    input: [...messages, { role: "user", content: expect.stringMatching(/json/i) }],
    text: { format: { type: "json_object" } },
  }), { timeout: 1000 });
});
