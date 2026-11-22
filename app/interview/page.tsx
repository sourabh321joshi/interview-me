import { Suspense } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getCurrentUserId } from "@/lib/auth";
import SignOut from "../sign-in/sign-out";
import { consentPolicy, hasCurrentConsent } from "@/lib/consent";
import ConsentScreen from "./consent-screen";
import Screen from "./screen";

async function SignedIn() {
  const userId = await getCurrentUserId(await headers());
  if (!userId) redirect("/sign-in");
  if (!await hasCurrentConsent(userId)) return <><SignOut /><ConsentScreen {...consentPolicy()} /></>;
  return <><SignOut /><Screen /></>;
}
export default function Page() {
  return <Suspense fallback={<p>Loading…</p>}><SignedIn /></Suspense>;
}
