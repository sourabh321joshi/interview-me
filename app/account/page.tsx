import { Suspense } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUserId } from "@/lib/auth";
import SignOut from "../sign-in/sign-out";
import DeleteAccount from "./delete-account";

async function Account() {
  if (!await getCurrentUserId(await headers())) redirect("/sign-in");
  return <>
    <SignOut />
    <main className="mx-auto max-w-xl px-5 py-12">
      <Link className="underline" href="/interview">Back to interview</Link>
      <h1 className="mt-6 text-3xl font-semibold">Your account</h1>
      <DeleteAccount />
    </main>
  </>;
}

export default function Page() {
  return <Suspense fallback={<p>Loading account...</p>}><Account /></Suspense>;
}
