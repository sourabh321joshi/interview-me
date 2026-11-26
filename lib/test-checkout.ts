import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { createMongoUsersStore } from "./interviews-store";
import { interviewPlans } from "./interview-plans";

const purpose = "interview-me-test";
type Plan = (typeof interviewPlans)[number];
export const orderId = z.string().regex(/^order_[a-zA-Z0-9]+$/);
export const paymentId = z.string().regex(/^pay_[a-zA-Z0-9]+$/);
export const signature = z.string().regex(/^[a-fA-F0-9]{64}$/);

export function testCheckoutConfig() {
  const key = process.env.RAZORPAY_TEST_KEY_ID?.trim();
  const secret = process.env.RAZORPAY_TEST_KEY_SECRET?.trim();
  const webhookSecret = process.env.RAZORPAY_TEST_WEBHOOK_SECRET?.trim();
  const origin = URL.parse(process.env.BETTER_AUTH_URL ?? "");
  if (!key?.startsWith("rzp_test_") || !secret || !origin || !["http:", "https:"].includes(origin.protocol)) return null;
  return { key, secret, webhookSecret, origin: origin.origin };
}
type Config = NonNullable<ReturnType<typeof testCheckoutConfig>>;

export function validSignature(message: string, supplied: string, secret: string) {
  if (!signature.safeParse(supplied).success) return false;
  const expected = createHmac("sha256", secret).update(message).digest();
  return timingSafeEqual(expected, Buffer.from(supplied, "hex"));
}

async function razorpay(config: Config, path: string, data?: object) {
  const response = await fetch("https://api.razorpay.com/v1" + path, {
    method: data ? "POST" : "GET",
    headers: { Authorization: "Basic " + Buffer.from(config.key + ":" + config.secret).toString("base64"), "Content-Type": "application/json" },
    body: data ? JSON.stringify(data) : undefined,
    cache: "no-store",
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error("Razorpay test request failed");
  return response.json();
}

export async function createTestOrder(config: Config, userId: string, plan: Plan) {
  await createMongoUsersStore().ensureUser(userId);
  const order = await razorpay(config, "/orders", {
    amount: plan.amount, currency: "INR", receipt: randomUUID(),
    notes: { purpose, account: userId, plan: plan.id },
  });
  return orderId.parse(order.id);
}

export async function fulfillTestPayment(config: Config, order: string, payment: string, expectedUser?: string) {
  const record = await razorpay(config, "/orders/" + orderId.parse(order));
  const owner = record.notes?.account;
  const plan = interviewPlans.find(item => item.id === record.notes?.plan);
  if (record.id !== order || record.notes?.purpose !== purpose || typeof owner !== "string" || !owner ||
      (expectedUser !== undefined && owner !== expectedUser) || !plan ||
      record.currency !== "INR" || record.amount !== plan.amount) return false;

  const paid = await razorpay(config, "/payments/" + paymentId.parse(payment));
  if (paid.id !== payment || paid.order_id !== order || paid.status !== "captured" ||
      paid.currency !== "INR" || paid.amount !== plan.amount) return false;

  await createMongoUsersStore().creditCheckout(owner, order, plan.seconds);
  return true;
}
