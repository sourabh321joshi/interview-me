import { apiError } from "./api-error";
import { DomainError } from "./interview-service";
import { LlmError } from "./llm";
import { RateLimitedError } from "./rate-limit";

export function handleError(err: unknown) {
  if (err instanceof RateLimitedError) {
    return apiError("rate_limited", err.message, { retry_after_seconds: err.retryAfterSeconds }, undefined, { "Retry-After": String(err.retryAfterSeconds) });
  }
  if (err instanceof DomainError) return apiError(err.code, err.message);
  if (err instanceof LlmError && err.code !== "config") return apiError("upstream_unavailable", "The AI service failed. Please try again.", { retryable: true });
  return apiError("internal", "Something went wrong.");
}
