"use client";
import { createAuthClient } from "better-auth/react";
import { useState, type FormEvent } from "react";

const client = createAuthClient();
export default function SignInForm({ google, destination }: { google: boolean; destination: string }) {
  const [register, setRegister] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email"));
    const password = String(form.get("password"));
    setBusy(true);
    setError("");
    try {
      const result = register
        ? await client.signUp.email({ name: String(form.get("name")), email, password })
        : await client.signIn.email({ email, password });
      if (result.error) setError(result.error.message || "Could not sign in.");
      else window.location.assign(destination);
    } catch { setError("Could not reach the server. Try again."); }
    finally { setBusy(false); }
  }
  return <main className="mx-auto max-w-md px-5 py-16">
    <h1 className="text-3xl font-semibold">{register ? "Create your account" : "Sign in to Interview Me"}</h1>
    <form onSubmit={submit} className="mt-8 grid gap-4">
      {register && <label>Your name<input className="field mt-1" name="name" required autoComplete="name" /></label>}
      <label>Email<input className="field mt-1" name="email" type="email" required autoComplete="email" /></label>
      <label>Password<input className="field mt-1" name="password" type="password" minLength={8} required autoComplete={register ? "new-password" : "current-password"} /></label>
      <button className="action" disabled={busy}>{register ? "Create account" : "Sign in with email"}</button>
    </form>
    {error && <p role="alert" className="mt-3">{error}</p>}
    {google && <button className="action mt-4" onClick={async () => {
      try { const result = await client.signIn.social({ provider: "google", callbackURL: destination });
        if (result.error) setError("Google sign-in failed. Try again.");
      } catch { setError("Could not reach Google sign-in."); }
    }}>Continue with Google</button>}
    <button className="mt-5 block underline" disabled={busy} onClick={() => { setRegister(!register); setError(""); }}>
      {register ? "Already have an account? Sign in" : "New here? Create an account"}
    </button>
  </main>;
}
