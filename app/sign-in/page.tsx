import SignInForm from "./form";
import { Suspense } from "react";

async function Form({ searchParams }: { searchParams: Promise<{ report?: string }> }) {
  const { report } = await searchParams;
  const destination = report && /^[a-f0-9]{24}$/i.test(report) ? "/report?interview=" + report : "/interview";
  return <SignInForm google={Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)} destination={destination} />;
}
export default function Page(props: { searchParams: Promise<{ report?: string }> }) {
  return <Suspense fallback={<p>Loading sign-in…</p>}><Form {...props} /></Suspense>;
}
