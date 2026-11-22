import type { RateLimitStore } from "@/lib/rate-limit";

export function memoryRateStore(): RateLimitStore & { counts: Map<string, number> } {
  const counts = new Map<string, number>();
  return { counts, async hit(id) { const n = (counts.get(id) ?? 0) + 1; counts.set(id, n); return n; } };
}
