import { z } from "zod";
import { apiError } from "@/lib/api-error";
import { getCurrentUserId } from "@/lib/auth";
import { rateLimited } from "@/lib/route-guard";
import { fulfillTestPayment, orderId, paymentId, signature, testCheckoutConfig, validSignature } from "@/lib/test-checkout";

const receipt = z.object({ order_id: orderId, payment_id: paymentId, signature });

export async function POST(request: Request) {
  const config = testCheckoutConfig();
  if (!config) return apiError("not_found", "Test checkout is unavailable.");
  if (request.headers.get("origin") !== config.origin) return apiError("validation_failed", "Open checkout from your account page.");
  const user = await getCurrentUserId(request.headers);
  if (!user) return apiError("unauthenticated", "Sign in to continue.");
  const limited = await rateLimited(user, "general");
  if (limited) return limited;
  const input = receipt.safeParse(await request.json().catch(() => null));
  if (!input.success || !validSignature(input.data.order_id + "|" + input.data.payment_id, input.data.signature, config.secret)) {
    return apiError("validation_failed", "Invalid Razorpay payment confirmation.");
  }
  try {
    return Response.json({ credited: await fulfillTestPayment(config, input.data.order_id, input.data.payment_id, user) });
  } catch {
    return apiError("upstream_unavailable", "Razorpay could not confirm the payment.");
  }
}
