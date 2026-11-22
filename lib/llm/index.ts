import type { z } from "zod";
import { createOpenAiProvider } from "./openai-provider";
import { estimateCostUsd, getPrices, type Price } from "./pricing";
import { createMongoUsageSink } from "./usage-sink";
import {
  LlmError, type CallContext, type LlmProvider, type Message, type Role, type Usage, type UsageSink,
} from "./types";

export * from "./types";

export function getModel(role: Role, env: Record<string, string | undefined> = process.env): string {
  const model = { profile: env.MODEL_PROFILE ?? env.MODEL_TURN, plan: env.MODEL_PLAN, turn: env.MODEL_TURN, report: env.MODEL_REPORT }[role];
  if (!model) throw new LlmError("config", `Model for role "${role}" is not configured`);
  return model;
}

const DEFAULT_TIMEOUT_MS: Record<Role, number> = { profile: 60_000, plan: 60_000, turn: 45_000, report: 120_000 };

export type LlmDeps = {
  provider: LlmProvider;
  sink: UsageSink;
  models?: (role: Role) => string;
  prices?: Record<string, Price>;
  now?: () => number;
};
export type CallInput = { system: string; messages: Message[]; ctx?: CallContext };

function parseJson(text: string): unknown {
  const t = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    return JSON.parse(t);
  } catch {
    return undefined;
  }
}

export function createLlm(deps: LlmDeps) {
  const models = deps.models ?? ((r: Role) => getModel(r));
  const now = deps.now ?? Date.now;

  async function record(role: Role, model: string, ctx: CallContext | undefined, usage: Usage, startedAt: number) {
    try {
      await deps.sink.record({
        ...ctx, provider: deps.provider.name, role, model, ...usage,
        latency_ms: now() - startedAt,
        est_cost_usd: estimateCostUsd(model, usage, deps.prices ?? getPrices()),
      });
    } catch {
      console.warn("usage logging failed"); // never log prompt or transcript content
    }
  }

  async function generateText(role: Role, input: CallInput, json: boolean): Promise<string> {
    const model = models(role);
    for (let attempt = 0; ; attempt++) {
      const startedAt = now();
      try {
        const res = await deps.provider.generate({ model, system: input.system, messages: input.messages, json, timeoutMs: DEFAULT_TIMEOUT_MS[role] });
        await record(role, model, input.ctx, res.usage, startedAt);
        return res.text;
      } catch (err) {
        if (attempt === 0 && err instanceof LlmError && err.retryable) continue;
        throw err;
      }
    }
  }

  // Structured output: validate with zod; one retry that shows the model its validation errors.
  async function generateJson<T>(role: Role, schema: z.ZodType<T>, input: CallInput): Promise<T> {
    let messages = input.messages;
    for (let attempt = 0; attempt < 2; attempt++) {
      const text = await generateText(role, { ...input, messages }, true);
      const parsed = parseJson(text);
      const result = schema.safeParse(parsed);
      if (result.success) return result.data;
      const issues = parsed === undefined
        ? "the output was not valid JSON"
        : result.error.issues.slice(0, 5).map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ");
      if (attempt === 1) throw new LlmError("invalid_output", `Model output failed validation: ${issues}`);
      messages = [...input.messages, { role: "assistant", content: text }, { role: "user", content: `Your previous output was invalid (${issues}). Return corrected JSON only.` }];
    }
    throw new LlmError("invalid_output", "unreachable");
  }

  // Streams text deltas for an interview turn. Retries once only if nothing was sent yet.
  async function* streamTurn(input: CallInput): AsyncGenerator<string> {
    const model = models("turn");
    let yielded = false;
    for (let attempt = 0; ; attempt++) {
      const startedAt = now();
      try {
        for await (const ev of deps.provider.stream({ model, system: input.system, messages: input.messages, timeoutMs: DEFAULT_TIMEOUT_MS.turn })) {
          if (ev.type === "delta") { yielded = true; yield ev.text; }
          else await record("turn", model, input.ctx, ev.usage, startedAt);
        }
        return;
      } catch (err) {
        if (attempt === 0 && !yielded && err instanceof LlmError && err.retryable) continue;
        throw err;
      }
    }
  }

  return { generateJson, streamTurn };
}

let shared: ReturnType<typeof createLlm> | undefined;
export function getLlm() {
  return (shared ??= createLlm({ provider: createOpenAiProvider(), sink: createMongoUsageSink() }));
}
