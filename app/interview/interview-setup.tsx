import Link from "next/link";
import { useState } from "react";
import { FREE_DURATION, interviewPlans } from "@/lib/interview-plans";
import { hasInterviewSlotForDuration, type InterviewAllowance } from "@/lib/quota";

type Option = { value: string; label: string; detail: string };

const roles: Option[] = [
  { value: "frontend", label: "Frontend", detail: "JavaScript, React, and browser fundamentals" },
  { value: "backend", label: "Backend", detail: "Node.js, APIs, and server-side fundamentals" },
  { value: "fullstack", label: "Full-stack", detail: "From the interface to the API" },
];
const levels: Option[] = [
  { value: "fresher", label: "Fresher", detail: "New to professional development" },
  { value: "junior", label: "1–3 years", detail: "Some professional development experience" },
];
function Choice({ name, option, defaultChecked }: { name: string; option: Option; defaultChecked: boolean }) {
  return (
    <label className="relative block cursor-pointer has-disabled:cursor-default">
      <input type="radio" name={name} value={option.value} defaultChecked={defaultChecked} className="peer absolute left-4 top-4 size-4 accent-indigo-500" />
      <span className="block min-h-full rounded-lg border border-line bg-background py-3 pl-10 pr-3 peer-checked:border-indigo-400 peer-checked:bg-indigo-500/10 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-indigo-300 peer-disabled:opacity-60">
        <span className="block text-sm font-semibold">{option.label}</span>
        <span className="mt-1 block text-sm leading-snug text-muted">{option.detail}</span>
      </span>
    </label>
  );
}

export default function InterviewSetup({ quota, busy, error, onStart, onReview }: {
  quota: InterviewAllowance | null | undefined;
  busy: string;
  error: string;
  onStart: (form: FormData) => Promise<void>;
  onReview: () => void;
}) {
  const [chosen, setChosen] = useState<number>();
  const plans: { seconds: number; label: string; price: number; credits: number }[] = interviewPlans.map(plan => ({
    seconds: Number(plan.seconds), label: plan.label, price: plan.amount / 100,
    credits: quota?.credits_by_duration?.[plan.seconds] ?? 0,
  }));
  const paid = quota?.paid_credits ?? 0;
  if (paid > 0) {
    plans.push({ seconds: 300, label: "Quick practice", price: 0, credits: paid });
    plans.push({ seconds: 600, label: "Standard practice", price: 0, credits: paid });
  }
  if (process.env.NODE_ENV === "development") {
    plans.push({ seconds: 60, label: "Local smoke test", price: 0, credits: quota?.smoke_interviews_remaining ?? 0 });
  }
  const available = (seconds: number) => quota == null || hasInterviewSlotForDuration(quota, seconds);
  const duration = chosen ?? plans.find(plan => available(plan.seconds))?.seconds ?? FREE_DURATION;
  const canStart = !busy && quota !== undefined && available(duration);
  const free = quota?.free_interviews_remaining ?? 0;
  return (
    <main className="mx-auto max-w-5xl px-5 pb-12 sm:px-8">
      <header className="border-b border-line py-5">
        <Link href="/" className="font-semibold hover:text-indigo-300">Interview Me</Link>
      </header>
      <div className="mx-auto mt-9 max-w-3xl sm:mt-12">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Set up your interview</h1>
        <p className="mt-3 text-muted">Choose the role, level, and length for your practice interview.</p>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (canStart) void onStart(new FormData(event.currentTarget));
          }}
          className="surface mt-7 p-5 sm:p-7"
        >
          <fieldset disabled={!!busy} className="min-w-0 space-y-6">
            <fieldset className="min-w-0">
              <legend className="mb-3 text-sm font-semibold">Target role</legend>
              <div className="grid gap-3 sm:grid-cols-3">
                {roles.map((option, i) => <Choice key={option.value} name="role" option={option} defaultChecked={i === 0} />)}
              </div>
            </fieldset>
            <fieldset className="min-w-0">
              <legend className="mb-3 text-sm font-semibold">Experience level</legend>
              <div className="grid gap-3 sm:grid-cols-2">
                {levels.map((option, i) => <Choice key={option.value} name="level" option={option} defaultChecked={i === 0} />)}
              </div>
            </fieldset>
            <fieldset className="min-w-0">
              <legend className="mb-3 text-sm font-semibold">Interview length</legend>
              <div className="grid gap-3 sm:grid-cols-2">
                {plans.map(plan => (
                  <label key={plan.seconds} className="relative block cursor-pointer">
                    <input type="radio" name="duration" value={plan.seconds} checked={duration === plan.seconds}
                      onChange={() => setChosen(plan.seconds)}
                      className="peer absolute left-4 top-4 size-4 accent-indigo-500" />
                    <span className="block rounded-lg border border-line bg-background py-3 pl-10 pr-3 peer-checked:border-indigo-400 peer-checked:bg-indigo-500/10 peer-focus-visible:outline-2 peer-focus-visible:outline-indigo-300">
                      <span className="block text-sm font-semibold">{plan.label} · {plan.seconds / 60} min</span>
                      <span className="mt-1 block text-sm text-muted">
                        {plan.seconds === FREE_DURATION && free > 0 ? "Free interview available" :
                          plan.price > 0 ? (plan.credits > 0 ? plan.credits + " available" : "\u20b9" + plan.price) :
                          plan.seconds === 60 ? "Development only" : plan.credits + " legacy credits available"}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="luna" /> Read questions aloud with Luna (sends question text to Deepgram)</label>
            <div role="status" className="rounded-lg border border-line bg-background px-4 py-3 text-sm">
              {quota === undefined ? "Checking interview allowance..." : quota === null ? "Interview allowance could not be loaded. It will be checked when you start." : <>
                <p className="font-semibold">{free ? "One free 3-minute interview available" : "Free 3-minute interview used"}</p>
                {!available(duration) && <p className="mt-1 text-muted">You need a credit for this length. <Link href="/account" className="text-indigo-300 underline">View interview credits</Link></p>}
              </>}
            </div>
            <div className="flex flex-wrap items-center gap-4 border-t border-line pt-5">
              <button type="submit" className="action" disabled={!canStart}>{busy || "Start interview"}</button>
              <button type="button" className="text-sm font-semibold text-indigo-300 underline disabled:opacity-50" onClick={onReview}>Review profile</button>
            </div>
          </fieldset>
          {busy && <p role="status" className="mt-4 text-sm text-muted">{busy} Your timer starts when the interview begins.</p>}
          {error && <p role="alert" className="mt-4 text-sm text-red-300">{error}</p>}
        </form>
      </div>
    </main>
  );
}
