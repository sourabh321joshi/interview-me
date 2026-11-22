import Link from "next/link";
import { Suspense } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getCurrentUserId } from "@/lib/auth";
import { HistoryQuery, listInterviewHistory } from "@/lib/history";
import { DIMENSIONS, type Dimension } from "@/lib/report-schema";
import SignOut from "../sign-in/sign-out";

type Props = { searchParams: Promise<{ cursor?: string }> };
const roles: Record<string, string> = { frontend: "Frontend", backend: "Backend", fullstack: "Full-stack" };
const dimensions: Record<Dimension, string> = {
  problem_solving: "Problem solving", technical_depth: "Technical depth",
  fundamentals: "Fundamentals", communication: "Communication",
};
const dateFormat = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: "UTC" });

async function History({ searchParams }: Props) {
  const userId = await getCurrentUserId(await headers());
  if (!userId) redirect("/sign-in");
  const query = HistoryQuery.safeParse(await searchParams);
  if (!query.success) redirect("/history");
  const { items, next_cursor } = await listInterviewHistory(userId, query.data);

  return <>
    <SignOut />
    <main className="mx-auto max-w-5xl px-5 py-10">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-semibold">Interview history</h1>
        <Link className="action" href="/interview">Start practice</Link>
      </div>
      {items.length === 0 && <p className="surface mt-6 p-5 text-muted">{query.data.cursor ? "No older interviews to show." : "Your practice interviews will appear here."}</p>}
      <ul className="mt-6 grid gap-3">
        {items.map(item => <li key={item.id} className="surface p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-semibold">{roles[item.role] ?? item.role}</h2>
              <p className="mt-1 text-sm text-muted">
                <time dateTime={item.created_at.toISOString()}>{dateFormat.format(item.created_at)}</time>
                {" · "}{item.duration_seconds / 60} min{" · "}{item.status.replaceAll("_", " ")}
              </p>
            </div>
            {item.status === "completed" && <Link className="underline" href={`/report?interview=${item.id}`}>View feedback</Link>}
          </div>
          {item.scores && <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            {DIMENSIONS.map(key => <div key={key}>
              <dt className="text-muted">{dimensions[key]}</dt>
              <dd>{item.scores?.[key] == null ? "Unscored" : `${item.scores[key]}/5`}</dd>
            </div>)}
          </dl>}
        </li>)}
      </ul>
      <div className="mt-6 flex gap-5">
        {query.data.cursor && <Link className="underline" href="/history">Latest interviews</Link>}
        {next_cursor && <Link className="underline" href={`/history?cursor=${encodeURIComponent(next_cursor)}`}>Older interviews</Link>}
      </div>
    </main>
  </>;
}

export default function Page(props: Props) {
  return <Suspense fallback={<p>Loading history...</p>}><History {...props} /></Suspense>;
}
