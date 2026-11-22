import { describe, expect, it } from "vitest";
import { statusFor } from "@/lib/api-error";
import { DEV_USER_ID, getCurrentUserId } from "@/lib/dev-user";

describe("api error statuses", () => {
  it("match api-design-v0.1.md", () => {
    expect(statusFor("validation_failed")).toBe(400);
    expect(statusFor("quota_exceeded")).toBe(402);
    expect(statusFor("not_found")).toBe(404);
    expect(statusFor("interview_expired")).toBe(410);
    expect(statusFor("rate_limited")).toBe(429);
    expect(statusFor("upstream_unavailable")).toBe(502);
  });
});

describe("dev user", () => {
  it("is a fixed id", () => expect(getCurrentUserId()).toBe(DEV_USER_ID));
});
