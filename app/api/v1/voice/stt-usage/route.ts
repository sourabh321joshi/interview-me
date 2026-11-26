import { z } from "zod";
import { getCurrentUserId } from "@/lib/auth";
import { apiError } from "@/lib/api-error";
import { rateLimited } from "@/lib/route-guard";
import { recordSpeechUsage, verifyVoiceUsageReceipt } from "@/lib/voice-usage";

const input = z.object({
  interview_id: z.string().regex(/^[a-f0-9]{24}$/),
  id: z.uuid(), proof: z.string().regex(/^[a-f0-9]{64}$/),
  seconds: z.number().gt(0).max(60),
  source: z.enum(["provider_metadata", "client_estimate"]),
});

export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin) return apiError("validation_failed", "Invalid request origin.");
  const user = await getCurrentUserId(request.headers);
  if (!user) return apiError("unauthenticated", "Sign in to continue.");
  const limited = await rateLimited(user, "general");
  if (limited) return limited;
  const parsed = input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("validation_failed", "Invalid speech usage.");
  const { interview_id, id, proof, seconds, source } = parsed.data;
  if (!verifyVoiceUsageReceipt(user, interview_id, id, proof)) return apiError("validation_failed", "Invalid speech usage receipt.");
  await recordSpeechUsage(user, interview_id, id, seconds, source);
  return new Response(null, { status: 204 });
}
