import { Suspense } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getCurrentUserId } from "@/lib/auth";
import SignOut from "../sign-in/sign-out";
import Screen from "./screen";

type Props = { searchParams: Promise<{ interview?: string }> };
async function SignedIn({ searchParams }: Props) {
  if (!await getCurrentUserId(await headers())) {
    const id = (await searchParams).interview;
    redirect(id && /^[a-f0-9]{24}$/i.test(id) ? "/sign-in?report=" + id : "/sign-in");
  }
  return <><SignOut /><Screen /></>;
}
export default function Page(props: Props) {
  return <Suspense fallback={<p>Loading…</p>}><SignedIn {...props} /></Suspense>;
}
