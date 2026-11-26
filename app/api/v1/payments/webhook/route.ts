import { z } from "zod";
import { apiError } from "@/lib/api-error";
import { fulfillTestPayment, orderId, paymentId, testCheckoutConfig, validSignature } from "@/lib/test-checkout";

const capturedPayment = z.object({
  event: z.literal("payment.captured"),
  payload: z.object({ payment: z.object({ entity: z.object({ order_id: orderId, id: paymentId }) }) }),
});

export async function POST(request: Request) {
  const config = testCheckoutConfig();
  if (!config?.webhookSecret) return apiError("not_found", "Test webhook is unavailable.");
  const signature = request.headers.get("x-razorpay-signature");
  const raw = await request.text();
  if (!signature || !validSignature(raw, signature, config.webhookSecret)) return apiError("validation_failed", "Invalid Razorpay webhook signature.");
  let body: unknown;
  try { body = JSON.parse(raw); } catch { return apiError("validation_failed", "Invalid webhook body."); }
  const event = capturedPayment.safeParse(body);
  if (event.success) {
    const payment = event.data.payload.payment.entity;
    try {
      await fulfillTestPayment(config, payment.order_id, payment.id);
    } catch {
      return apiError("internal", "Credit fulfillment could not complete.");
    }
  }
  return Response.json({ received: true });
}
