"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { interviewPlans } from "@/lib/interview-plans";

type Receipt = { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string };
type CheckoutOptions = {
  key: string; order_id: string; name: string; description: string;
  handler: (receipt: Receipt) => void; modal: { ondismiss: () => void };
};

declare global {
  interface Window {
    Razorpay?: new (options: CheckoutOptions) => { open: () => void };
  }
}

async function paymentRequest(path: string, data: object) {
  const res = await fetch("/api/v1/payments/" + path, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error?.message ?? "Test checkout failed.");
  return body;
}

export default function TestCredits({ keyId, balances }: { keyId: string; balances: Record<string, number> }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [pendingReceipt, setPendingReceipt] = useState<Receipt>();
  const [openingCheckout, setOpeningCheckout] = useState(false);

  async function confirm(receipt: Receipt) {
    setBusy(true);
    setStatus("Confirming payment...");
    try {
      const result = await paymentRequest("confirm", {
        order_id: receipt.razorpay_order_id, payment_id: receipt.razorpay_payment_id, signature: receipt.razorpay_signature,
      });
      if (result.credited) {
        setStatus("Test payment confirmed. Your credit is ready.");
        setPendingReceipt(undefined);
        router.refresh();
        setBusy(false);
        return;
      }
      setStatus("Payment capture is pending. Check again before making another payment.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not confirm the test payment.");
    }
    setBusy(false);
  }

  async function start(plan: (typeof interviewPlans)[number]) {
    if (busy || openingCheckout || pendingReceipt) return;
    setOpeningCheckout(true);
    setStatus("Opening Razorpay...");
    try {
      if (!window.Razorpay) {
        await new Promise<void>((resolve, reject) => {
          const script = document.createElement("script");
          script.src = "https://checkout.razorpay.com/v1/checkout.js";
          script.onload = () => resolve();
          script.onerror = () => { script.remove(); reject(new Error("Razorpay checkout could not load.")); };
          document.head.append(script);
        });
      }
      if (!window.Razorpay) throw new Error("Razorpay checkout could not load.");
      const { order_id } = await paymentRequest("checkout", { plan: plan.id });
      new window.Razorpay({
        key: keyId, order_id, name: "Interview Me", description: plan.seconds / 60 + "-minute test interview",
        handler(receipt) {
          setOpeningCheckout(false);
          setPendingReceipt(receipt);
          void confirm(receipt);
        },
        modal: { ondismiss() { setOpeningCheckout(false); setStatus(""); } },
      }).open();
    } catch (error) {
      setOpeningCheckout(false);
      setStatus(error instanceof Error ? error.message : "Razorpay test checkout could not start.");
    }
  }

  return <section className="surface mt-6 space-y-3 p-5" aria-labelledby="test-credits">
    <h2 id="test-credits" className="text-lg font-semibold">Interview credits</h2>
    <p className="text-sm text-muted">Razorpay Test Mode. Use a test payment method.</p>
    <ul className="divide-y divide-line">
      {interviewPlans.map(plan => <li key={plan.id} className="flex items-center justify-between gap-3 py-3">
        <div>
          <p className="font-semibold">{plan.label} · {plan.seconds / 60} min</p>
          <p className="text-sm text-muted">{balances[plan.seconds] ?? 0} available</p>
        </div>
        <button type="button" className="action" disabled={busy || openingCheckout || !!pendingReceipt}
          onClick={() => void start(plan)}>Test pay ₹{plan.amount / 100}</button>
      </li>)}
    </ul>
    {status && <p role="status" className="text-sm text-indigo-200">{status}</p>}
    {pendingReceipt && !busy && <button type="button" className="text-sm underline" onClick={() => void confirm(pendingReceipt)}>Check payment again</button>}
  </section>;
}
