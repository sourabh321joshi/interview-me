import { z } from "zod";
import { apiError } from "@/lib/api-error";
import { getCurrentUserId } from "@/lib/auth";
import { acceptConsent, consentPolicy } from "@/lib/consent";
import { rateLimited } from "@/lib/route-guard";

const acceptance = z.object({ version: z.string(), provider: z.string() });

export async function POST(request: Request) {
  const userId = await getCurrentUserId(request.headers);
  if (!userId) return apiError("unauthenticated", "Sign in to continue.");
  const limited = await rateLimited(userId, "general");
  if (limited) return limited;
  const body = acceptance.safeParse(await request.json().catch(() => null));
  const { version, provider, processors } = consentPolicy();
  if (!body.success || body.data.version !== version || body.data.provider !== provider) {
    return apiError("validation_failed", "The data terms may have changed. Reload and review them again.");
  }
  await acceptConsent(userId, version, processors);
  return new Response(null, { status: 204 });
}
