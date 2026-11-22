import { Suspense } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getCurrentUserId } from "@/lib/auth";
import { consentPolicy, hasCurrentConsent } from "@/lib/consent";
import ConsentScreen from "../interview/consent-screen";
import SignOut from "../sign-in/sign-out";
import Screen from "./screen";

type Props = { searchParams: Promise<{ interview?: string }> };
async function SignedIn({ searchParams }: Props) {
  const userId = await getCurrentUserId(await headers());
  if (!userId) {
    const id = (await searchParams).interview;
    redirect(id && /^[a-f0-9]{24}$/i.test(id) ? "/sign-in?report=" + id : "/sign-in");
  }
  if (!await hasCurrentConsent(userId)) return <><SignOut /><ConsentScreen {...consentPolicy()} /></>;
  return <><SignOut /><Screen /></>;
}
export default function Page(props: Props) {
  return <Suspense fallback={<p>Loading…</p>}><SignedIn {...props} /></Suspense>;
}
