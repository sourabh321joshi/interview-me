import { createHmac } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { POST as webhook } from "@/app/api/v1/payments/webhook/route";
import { POST as createCheckout } from "@/app/api/v1/payments/checkout/route";
import { POST as confirm } from "@/app/api/v1/payments/confirm/route";
import { testCheckoutConfig } from "@/lib/test-checkout";

const updateOne = vi.hoisted(() => vi.fn());
vi.mock("@/lib/db", () => ({ COLLECTIONS: { app_users: "app_users" }, getDb: () => ({ collection: () => ({ updateOne }) }) }));
vi.mock("@/lib/auth", () => ({ getCurrentUserId: () => "owner" }));
vi.mock("@/lib/route-guard", () => ({ rateLimited: () => null }));

const secret = "fixture-secret";
const eventSecret = "fixture-webhook";
const order = { id: "order_fixture", amount: 4900, currency: "INR", notes: { purpose: "interview-me-test", account: "owner", plan: "full" } };
const payment = { id: "pay_fixture", order_id: order.id, status: "captured", amount: order.amount, currency: order.currency };
const sign = (data: string, key: string) => createHmac("sha256", key).update(data).digest("hex");

beforeEach(() => {
  updateOne.mockReset();
  vi.stubEnv("RAZORPAY_TEST_KEY_ID", "rzp_test_fixture");
  vi.stubEnv("RAZORPAY_TEST_KEY_SECRET", secret);
  vi.stubEnv("RAZORPAY_TEST_WEBHOOK_SECRET", eventSecret);
  vi.stubEnv("BETTER_AUTH_URL", "http://localhost:3000");
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

function event(key = eventSecret) {
  const body = JSON.stringify({ event: "payment.captured", payload: { payment: { entity: payment } } });
  return webhook(new Request("http://localhost:3000/api/v1/payments/webhook", {
    method: "POST", headers: { "x-razorpay-signature": sign(body, key) }, body,
  }));
}

function checkoutReceipt() {
  return confirm(new Request("http://localhost:3000/api/v1/payments/confirm", {
    method: "POST", headers: { origin: "http://localhost:3000" },
    body: JSON.stringify({ order_id: order.id, payment_id: payment.id, signature: sign(order.id + "|" + payment.id, secret) }),
  }));
}

function mockProvider(capture = payment, owner = "owner") {
  const fetchMock = vi.fn(async (url: string) => Response.json(url.includes("/orders/")
    ? { ...order, notes: { ...order.notes, account: owner } } : capture));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

it("rejects bad signatures before calling Razorpay or touching the account", async () => {
  const fetchMock = mockProvider();
  expect((await event("wrong")).status).toBe(400);
  expect(fetchMock).not.toHaveBeenCalled();
  expect(updateOne).not.toHaveBeenCalled();
});

it("rejects uncaptured, partial and foreign checkout confirmations", async () => {
  for (const [current, owner] of [
    [{ ...payment, status: "authorized" }, "owner"],
    [{ ...payment, amount: 100 }, "owner"],
    [payment, "another-account"],
    [{ ...payment, order_id: "order_other" }, "owner"],
  ] as const) {
    mockProvider(current, owner);
    expect(await (await checkoutReceipt()).json()).toEqual({ credited: false });
  }
  expect(updateOne).not.toHaveBeenCalled();
});

it("credits a verified capture once for the purchased duration across duplicate deliveries", async () => {
  mockProvider();
  const orders = new Set<string>();
  let credits = 0;
  updateOne.mockImplementation((filter, update) => {
    const id = filter.credited_razorpay_orders.$ne;
    if (!orders.has(id)) {
      orders.add(update.$addToSet.credited_razorpay_orders);
      credits += update.$inc["paid_duration_credits.900"];
    }
  });
  const responses = await Promise.all([event(), event(), checkoutReceipt()]);
  expect(responses.map(res => res.status)).toEqual([200, 200, 200]);
  expect(credits).toBe(1);
  expect(updateOne).toHaveBeenCalledWith(
    { _id: "owner", credited_razorpay_orders: { $ne: order.id } },
    { $addToSet: { credited_razorpay_orders: order.id }, $inc: { "paid_duration_credits.900": 1 } },
  );
});

it("rejects live keys", () => {
  vi.stubEnv("RAZORPAY_TEST_KEY_ID", "rzp_live_fixture");
  expect(testCheckoutConfig()).toBeNull();
});

it("creates an order using the configured price and signed-in owner", async () => {
  const provider = vi.fn<(url: string, init: RequestInit) => Promise<Response>>()
    .mockResolvedValue(Response.json({ id: "order_example" }));
  vi.stubGlobal("fetch", provider);
  const res = await createCheckout(new Request("http://localhost:3000/api/v1/payments/checkout", {
    method: "POST", headers: { origin: "http://localhost:3000" },
    body: JSON.stringify({ plan: "deep", amount: 1, account: "someone-else" }),
  }));
  expect(await res.json()).toEqual({ order_id: "order_example" });
  expect(JSON.parse(String(provider.mock.calls[0][1].body))).toMatchObject({
    amount: 8900, currency: "INR", notes: { account: "owner", plan: "deep" },
  });
});
