import { normalizeQuote, type Report } from "@/lib/report-schema";

export function reportQuotes(report: Report): string[] {
  return [...Object.values(report.scores).flatMap(({ evidence }) => evidence.map(({ quote }) => quote)),
    ...report.top_fixes.map(({ evidence_quote }) => evidence_quote)];
}

export function highlightQuotes(text: string, quotes: string[]) {
  const unique = new Set(quotes.map(normalizeQuote).filter(Boolean));
  const matches: { start: number; end: number }[] = [];
  for (const quote of unique) {
    const pattern = quote.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/ /g, "\\s+");
    for (const match of text.matchAll(new RegExp(pattern, "g"))) {
      matches.push({ start: match.index, end: match.index + match[0].length });
    }
  }
  matches.sort((a, b) => a.start - b.start);

  const ranges: typeof matches = [];
  for (const match of matches) {
    const previous = ranges.at(-1);
    if (previous && match.start <= previous.end) previous.end = Math.max(previous.end, match.end);
    else ranges.push(match);
  }

  let offset = 0;
  const segments = ranges.flatMap(({ start, end }) => {
    const preceding = text.slice(offset, start);
    offset = end;
    return [{ text: preceding, highlighted: false }, { text: text.slice(start, end), highlighted: true }];
  });
  return [...segments, { text: text.slice(offset), highlighted: false }].filter((segment) => segment.text);
}
