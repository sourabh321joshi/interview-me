import { z } from "zod";
import { getCurrentUserId } from "@/lib/auth";
import { apiError } from "@/lib/api-error";
import { rateLimited } from "@/lib/route-guard";

const input = z.object({ voice: z.enum(["asteria", "luna"]) }).strict();
const question = "Imagine a UPI payment is pending during a network outage. How would your backend handle a retry without charging the customer twice?";

export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin) return apiError("validation_failed", "Open the voice test to play a sample.");
  const user = await getCurrentUserId(request.headers);
  if (!user) return apiError("unauthenticated", "Sign in to preview Deepgram voices.");
  const parsed = input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("validation_failed", "Choose a supported sample voice.");
  const limited = await rateLimited(user, "general");
  if (limited) return limited;
  const key = process.env.DEEPGRAM_API_KEY?.trim();
  if (!key) return apiError("upstream_unavailable", "Deepgram is not configured.");
  try {
    const url = new URL("https://api.deepgram.com/v1/speak");
    url.search = new URLSearchParams({ model: "aura-2-" + parsed.data.voice + "-en", encoding: "mp3" }).toString();
    const result = await fetch(url, {
      method: "POST", headers: { Authorization: "Token " + key, "Content-Type": "application/json" },
      body: JSON.stringify({ text: question }), signal: AbortSignal.timeout(15000),
    });
    if (!result.ok || !result.body) throw new Error();
    return new Response(result.body, { headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" } });
  } catch {
    return apiError("upstream_unavailable", "Deepgram could not generate the sample.");
  }
}
