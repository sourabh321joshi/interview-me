import { Suspense } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getCurrentUserId } from "@/lib/auth";
import SignOut from "../sign-in/sign-out";
import Screen from "./screen";

async function SignedIn() {
  if (!await getCurrentUserId(await headers())) {
    redirect("/sign-in");
  }
  return <><SignOut /><Screen /></>;
}
export default function Page() {
  return <Suspense fallback={<p>Loading…</p>}><SignedIn /></Suspense>;
}
