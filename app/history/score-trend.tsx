"use client";

import Link from "next/link";
import { useState } from "react";
import { historyScoreSeries, type historyTrendRows } from "@/lib/history-trend";
import type { Dimension } from "@/lib/report-schema";

const date = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: "UTC" });
const ticks = [5, 4, 3, 2, 1, 0];
const formatChange = new Intl.NumberFormat("en", { signDisplay: "exceptZero" });

export default function ScoreTrend({ rows, dimensions, roles }: {
  rows: ReturnType<typeof historyTrendRows>;
  dimensions: Record<Dimension, string>;
  roles: Record<string, string>;
}) {
  const [dimension, setDimension] = useState<Dimension>("problem_solving");
  const [selectedId, setSelectedId] = useState<string>();
  const { points, latest, change } = historyScoreSeries(rows, dimension);
  const selected = points.find(point => point.id === selectedId) ?? latest;

  return <section className="surface mt-6 p-5 sm:p-6" aria-labelledby="score-trend">
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h2 id="score-trend" className="text-xl font-semibold">Score trends</h2>
        <p className="mt-1 text-sm text-muted">Reports on this page, oldest to newest.</p>
      </div>
      <label className="text-sm">
        <span className="sr-only">Score to show</span>
        <select className="field" value={dimension} onChange={event => {
          setDimension(event.target.value as Dimension);
          setSelectedId(undefined);
        }}>
          {Object.entries(dimensions).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </select>
      </label>
    </div>

    <div className="mt-5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
      {latest ? <>
        <strong className="text-2xl font-semibold tabular-nums">{latest.score}<span className="ml-1 text-base text-muted">/ 5</span></strong>
        <span className="text-sm text-muted">Latest scored interview</span>
        {change !== null && <span className="rounded-md bg-background px-2 py-1 text-xs text-indigo-200">
          {formatChange.format(change)} {Math.abs(change) === 1 ? "point" : "points"} from previous score
        </span>}
      </> : <p className="text-sm text-muted">No {dimensions[dimension].toLowerCase()} scores on this page.</p>}
    </div>

    <div className="mt-5 flex gap-2">
      <div aria-hidden="true" className="relative h-36 w-4 shrink-0 text-xs tabular-nums text-muted">
        {ticks.map(tick => <span key={tick} className="absolute right-0 -translate-y-1/2" style={{ top: (5 - tick) * 20 + "%" }}>{tick}</span>)}
      </div>
      <div className="min-w-0 flex-1 overflow-x-auto">
        <div className="relative" style={{ minWidth: points.length * 30 }}>
          <div aria-hidden="true" className="pointer-events-none absolute inset-0">
            {ticks.map(tick => <div key={tick} className="absolute inset-x-0 border-t border-line" style={{ top: (5 - tick) * 20 + "%" }} />)}
          </div>
          <ol className="relative grid h-36" style={{ gridTemplateColumns: "repeat(" + points.length + ", minmax(0, 1fr))" }} aria-label={dimensions[dimension] + " by interview"}>
            {points.map(point => {
              const active = point.id === selected?.id;
              return <li key={point.id} className="min-w-0">
                <button type="button" aria-pressed={active}
                  aria-label={date.format(new Date(point.date)) + ", " + (roles[point.role] ?? point.role) + ", " + (point.score == null ? "unscored" : point.score + " out of 5")}
                  onClick={() => setSelectedId(point.id)}
                  className="group flex size-full cursor-pointer items-end justify-center rounded-sm hover:bg-indigo-400/10 focus-visible:outline-offset-[-2px]">
                  {point.score == null ? (
                    <span aria-hidden="true" className={active ? "mb-1 h-1 w-3 bg-indigo-300" : "mb-1 h-1 w-3 bg-muted"} />
                  ) : (
                    <span aria-hidden="true" style={{ height: point.score * 20 + "%" }}
                      className={`flex w-3/5 max-w-10 justify-center rounded-t pt-1 text-xs font-semibold tabular-nums ${active ? "bg-indigo-300 text-slate-950" : "bg-indigo-500/50 text-indigo-50 group-hover:bg-indigo-400/70"}`}>
                      {point.score}
                    </span>
                  )}
                </button>
              </li>;
            })}
          </ol>
        </div>
      </div>
    </div>

    {selected && <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3 text-sm">
      <p aria-live="polite">
        <time dateTime={selected.date}>{date.format(new Date(selected.date))}</time>
        {" · "}{roles[selected.role] ?? selected.role}{" · "}{selected.score == null ? "Unscored" : selected.score + "/5"}
      </p>
      <Link className="text-indigo-200 underline" href={`/report?interview=${selected.id}`}>View selected feedback</Link>
    </div>}
  </section>;
}
