import { z } from "zod";
import { getCurrentUserId } from "@/lib/auth";
import { rateLimited } from "@/lib/route-guard";
import { interviewPlans } from "@/lib/interview-plans";
import { createTestOrder, testCheckoutConfig } from "@/lib/test-checkout";
import { apiError } from "@/lib/api-error";

export async function POST(request: Request) {
  const config = testCheckoutConfig();
  if (!config) return apiError("not_found", "Test checkout is unavailable.");
  if (request.headers.get("origin") !== config.origin) return apiError("validation_failed", "Open checkout from your account page.");
  const user = await getCurrentUserId(request.headers);
  if (!user) return apiError("unauthenticated", "Sign in to continue.");
  const limited = await rateLimited(user, "general");
  if (limited) return limited;
  const input = z.object({ plan: z.string() }).safeParse(await request.json().catch(() => null));
  const plan = input.success && interviewPlans.find(item => item.id === input.data.plan);
  if (!plan) return apiError("validation_failed", "Choose an interview plan.");
  try {
    const order = await createTestOrder(config, user, plan);
    return Response.json({ order_id: order }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return apiError("upstream_unavailable", "Razorpay test checkout could not start.");
  }
}
