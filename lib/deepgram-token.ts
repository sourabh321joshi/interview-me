import { apiError } from "./api-error";

export async function deepgramToken(settings = {}) {
  const key = process.env.DEEPGRAM_API_KEY?.trim();
  if (!key) return apiError("upstream_unavailable", "Deepgram is not configured.");
  try {
    const grant = await fetch("https://api.deepgram.com/v1/auth/grant", {
      method: "POST", headers: { Authorization: "Token " + key }, signal: AbortSignal.timeout(8000),
    });
    if (!grant.ok) throw new Error();
    const { access_token, expires_in } = await grant.json();
    if (typeof access_token !== "string" || !access_token) throw new Error();
    return Response.json({ access_token, expires_in, ...settings }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return apiError("upstream_unavailable", "Deepgram could not authorize live captions.");
  }
}
