import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto max-w-6xl px-5 sm:px-10">
      <header className="flex items-center justify-between gap-4 border-b border-line py-5">
        <p className="font-semibold tracking-tight">Interview Me</p>
        <Link href="/interview" className="text-sm font-medium text-indigo-300 hover:text-white">Start practice</Link>
      </header>
      <div className="grid items-center gap-10 py-16 sm:py-24 lg:grid-cols-[1.15fr_1fr] lg:gap-16">
        <section>
          <h1 className="max-w-xl text-4xl font-semibold tracking-tight sm:text-6xl">Practice talking through what you built.</h1>
          <p className="mt-5 max-w-lg text-base leading-relaxed text-muted sm:text-lg">
            Take a five-minute developer interview with questions about your projects and feedback grounded in your answers.
          </p>
          <Link className="action mt-7" href="/interview">Start a practice interview</Link>
        </section>
        <section className="surface p-5 sm:p-7" aria-labelledby="example">
          <h2 id="example" className="text-sm font-semibold text-indigo-300">Example interview</h2>
          <p className="mt-4 text-xl font-semibold">How did you keep your Kanban board in sync across tabs?</p>
          <blockquote className="mt-4 border-l-2 border-indigo-400 pl-4 text-muted">
            “I used Socket.IO to broadcast updates after each change.”
          </blockquote>
          <p className="mt-5 border-t border-line pt-4 text-sm leading-relaxed text-muted">
            <span className="font-semibold text-foreground">Feedback</span><br />
            Explain what happens when the connection drops and how the board catches up.
          </p>
        </section>
      </div>
      <p className="border-t border-line py-5 text-sm text-muted">Your resume PDF is discarded after processing.</p>
    </main>
  );
}
