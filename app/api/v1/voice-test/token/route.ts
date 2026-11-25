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
  const key = process.env.DEEPGRAM_API_KEY?.trim();
  if (!key) return apiError("upstream_unavailable", "Deepgram is not configured.");
  try {
    const grant = await fetch("https://api.deepgram.com/v1/auth/grant", {
      method: "POST", headers: { Authorization: "Token " + key }, signal: AbortSignal.timeout(8000),
    });
    if (!grant.ok) throw new Error();
    const { access_token } = await grant.json();
    if (typeof access_token !== "string" || !access_token) throw new Error();
    return Response.json({ access_token }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return apiError("upstream_unavailable", "Deepgram could not authorize live captions.");
  }
}
