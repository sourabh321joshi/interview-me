import { NextResponse } from "next/server";

// Error codes and statuses from api-design-v0.1.md.
const STATUS = {
  validation_failed: 400,
  unauthenticated: 401,
  quota_exceeded: 402,
  consent_required: 403,
  not_found: 404,
  interview_not_active: 409,
  profile_not_ready: 409,
  interview_expired: 410,
  file_too_large: 413,
  rate_limited: 429,
  upstream_unavailable: 502,
  internal: 500,
} as const;

export type ApiErrorCode = keyof typeof STATUS;

export function statusFor(code: ApiErrorCode): number {
  return STATUS[code];
}

export function apiError(
  code: ApiErrorCode,
  message: string,
  details: Record<string, unknown> = {},
  requestId: string = crypto.randomUUID(),
  headers: Record<string, string> = {},
) {
  return NextResponse.json(
    { error: { code, message, details, request_id: requestId } },
    { status: STATUS[code], headers: { "x-request-id": requestId, ...headers } },
  );
}
