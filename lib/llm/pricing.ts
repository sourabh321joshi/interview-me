import type { Usage } from "./types";

// USD per 1M tokens. Fill in from your provider's pricing page, or set
// MODEL_PRICES_JSON='{"model-name":{"input":0.2,"output":1.25,"cached_input":0.05}}'.
// Unknown models are estimated at 0, so check usage totals against your provider dashboard.
export type Price = { input: number; output: number; cached_input?: number };
export const PRICES: Record<string, Price> = {};

export function getPrices(env: Record<string, string | undefined> = process.env): Record<string, Price> {
  if (!env.MODEL_PRICES_JSON) return PRICES;
  try {
    return { ...PRICES, ...JSON.parse(env.MODEL_PRICES_JSON) };
  } catch {
    return PRICES;
  }
}

export function estimateCostUsd(model: string, usage: Usage, prices: Record<string, Price> = getPrices()): number {
  const p = prices[model];
  if (!p) return 0;
  const cached = Math.min(usage.cached_input_tokens, usage.input_tokens);
  const uncached = usage.input_tokens - cached;
  return (uncached * p.input + cached * (p.cached_input ?? p.input) + usage.output_tokens * p.output) / 1e6;
}
