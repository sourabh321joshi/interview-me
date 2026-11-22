"use client";
import { createAuthClient } from "better-auth/react";
import Link from "next/link";
import { useState } from "react";
const client = createAuthClient();
export default function SignOut() {
  const [failed, setFailed] = useState(false);
  return <div className="mx-auto max-w-5xl px-5 pt-3 text-right">
    <Link className="mr-4 underline" href="/account">Account</Link>
    <button onClick={async () => {
      try { const result = await client.signOut();
        if (result.error) setFailed(true); else window.location.replace("/");
      } catch { setFailed(true); }
    }}>Sign out</button>
    {failed && <span role="alert"> Could not sign out. Try again.</span>}
  </div>;
}
