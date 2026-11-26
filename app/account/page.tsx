import { Suspense } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUserId } from "@/lib/auth";
import SignOut from "../sign-in/sign-out";
import { createMongoUsersStore } from "@/lib/interviews-store";
import { testCheckoutConfig } from "@/lib/test-checkout";
import TestCredits from "./test-credits";
import DeleteAccount from "./delete-account";

async function Account() {
  const userId = await getCurrentUserId(await headers());
  if (!userId) redirect("/sign-in");
  const config = testCheckoutConfig();
  const balance = config ? await createMongoUsersStore().allowance(userId, 1) : null;
  return <>
    <SignOut />
    <main className="mx-auto max-w-xl px-5 py-12">
      <Link className="underline" href="/interview">Back to interview</Link>
      <h1 className="mt-6 text-3xl font-semibold">Your account</h1>
      {config && <TestCredits keyId={config.key} balances={balance?.credits_by_duration ?? {}} />}
      <DeleteAccount />
    </main>
  </>;
}

export default function Page() {
  return <Suspense fallback={<p>Loading account...</p>}><Account /></Suspense>;
}
