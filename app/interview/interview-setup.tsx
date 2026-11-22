import Link from "next/link";

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
const durations: Option[] = [
  ...(process.env.NODE_ENV === "development" ? [{ value: "60", label: "1 minute", detail: "Local smoke test" }] : []),
  { value: "300", label: "5 minutes", detail: "Quick practice" },
  { value: "600", label: "10 minutes", detail: "More time for follow-up questions" },
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

export default function InterviewSetup({ busy, error, onStart, onReview }: {
  busy: string;
  error: string;
  onStart: (form: FormData) => Promise<void>;
  onReview: () => void;
}) {
  return (
    <main className="mx-auto max-w-5xl px-5 pb-12 sm:px-8">
      <header className="border-b border-line py-5">
        <Link href="/" className="font-semibold hover:text-indigo-300">Interview Me</Link>
      </header>
      <div className="mx-auto mt-9 max-w-3xl sm:mt-12">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Set up your interview</h1>
        <p className="mt-3 text-muted">Choose the role, level, and length for your text practice interview.</p>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (!busy) void onStart(new FormData(event.currentTarget));
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
                {durations.map((option, i) => <Choice key={option.value} name="duration" option={option} defaultChecked={i === 0} />)}
              </div>
            </fieldset>
            <div className="flex flex-wrap items-center gap-4 border-t border-line pt-5">
              <button type="submit" className="action">{busy || "Start interview"}</button>
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
