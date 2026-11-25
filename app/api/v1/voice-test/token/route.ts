import { deepgramToken } from "@/lib/deepgram-token";
import { getCurrentUserId } from "@/lib/auth";
import { apiError } from "@/lib/api-error";
import { rateLimited } from "@/lib/route-guard";

export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin) {
    return apiError("validation_failed", "Start the voice test from this app.");
  }
  const user = await getCurrentUserId(request.headers);
  if (!user) return apiError("unauthenticated", "Sign in before starting live captions.");
  const limited = await rateLimited(user, "general");
  if (limited) return limited;
  return deepgramToken();
}
