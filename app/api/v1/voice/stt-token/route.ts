import { z } from "zod";
import { apiError } from "@/lib/api-error";
import { getCurrentUserId } from "@/lib/auth";
import { consentRequired } from "@/lib/consent";
import { voiceUsageReceipt } from "@/lib/voice-usage";
import { deepgramToken } from "@/lib/deepgram-token";
import { createMongoInterviewsStore } from "@/lib/interviews-store";
import { createMongoProfilesStore } from "@/lib/profiles-store";
import { createMongoRateLimitStore } from "@/lib/rate-limit";
import { rateLimited } from "@/lib/route-guard";

const input = z.object({ interview_id: z.string().regex(/^[a-f0-9]{24}$/i) });

export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin) return apiError("validation_failed", "Start voice input from the interview.");
  const user = await getCurrentUserId(request.headers);
  if (!user) return apiError("unauthenticated", "Sign in to continue.");
  const limited = await rateLimited(user, "general");
  if (limited) return limited;
  const body = input.safeParse(await request.json().catch(() => null));
  if (!body.success) return apiError("validation_failed", "A valid interview ID is required.");
  const iv = await createMongoInterviewsStore().findOwned(user, body.data.interview_id);
  if (!iv) return apiError("not_found", "Interview not found.");
  if (iv.status !== "in_progress") return apiError("interview_not_active", "The interview must be active.");
  if (!iv.ends_at || iv.ends_at.getTime() <= Date.now()) return apiError("interview_expired", "The interview has ended.");
  const consent = await consentRequired(user);
  if (consent) return consent;
  const count = await createMongoRateLimitStore().hit(`voice:${user}:${iv.id}`, iv.ends_at);
  if (count > 5) return apiError("rate_limited", "Voice input limit reached. You can still type your answer.");
  const profile = iv.profile_id ? await createMongoProfilesStore().findOwned(user, iv.profile_id) : null;
  const keyterms = [...new Set(profile?.summary?.skills ?? [])].filter(Boolean).slice(0, 10);
  return deepgramToken({
    usage_receipt: voiceUsageReceipt(user, iv.id),
    ws_url: "wss://api.deepgram.com/v1/listen",
    connect_params: { model: "nova-3", language: "multi", interim_results: true, endpointing: 400, keyterms },
  });
}
