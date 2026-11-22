export default function Home() {
  return (
    <main className="mx-auto max-w-xl p-8">
      <h1 className="text-2xl font-semibold">Interview Me</h1>
      <p className="mt-2 text-sm text-gray-600"><a className="underline" href="/interview">Start a practice interview</a> · <a className="underline" href="/api/v1/health">Health check</a></p>
    </main>
  );
}
