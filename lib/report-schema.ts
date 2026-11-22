import { z } from "zod";

const s = (max: number) => z.string().trim().max(max);
export const DIMENSIONS = ["problem_solving", "technical_depth", "fundamentals", "communication"] as const;
export type Dimension = (typeof DIMENSIONS)[number];

const Dim = z.object({
  score: z.number().int().min(1).max(5).nullable(),
  rationale: s(500),
  evidence: z.array(z.object({ quote: s(400), note: s(300) })).max(4),
});

// Shape from interview-rubric-and-prompts-v0.1.md, section 5.
const BaseReportSchema = z.object({
  summary: s(600),
  scores: z.object({ problem_solving: Dim, technical_depth: Dim, fundamentals: Dim, communication: Dim }),
  strengths: z.array(s(300)).min(1).max(3),
  top_fixes: z.array(z.object({ title: s(120), why_it_matters: s(400), evidence_quote: s(400), how_to_improve: s(500) })).length(3),
  suggested_practice: z.array(s(300)).min(1).max(5),
  limitations: s(400),
});
export type Report = z.infer<typeof BaseReportSchema> & { rubric_version: string };

// Collapse whitespace and drop wrapping quote marks. Words must still match exactly.
export const normalizeQuote = (q: string) => q.replace(/^["“”'‘’\s]+|["“”'‘’\s]+$/g, "").replace(/\s+/g, " ");

// Every quote must appear in something the candidate said. Failures become retry feedback for the model.
export function buildReportSchema(candidateTexts: string[]) {
  const haystack = candidateTexts.map((t) => t.replace(/\s+/g, " "));
  const found = (q: string) => { const n = normalizeQuote(q); return n.length >= 8 && haystack.some((h) => h.includes(n)); };
  return BaseReportSchema.superRefine((r, ctx) => {
    for (const d of DIMENSIONS) {
      const dim = r.scores[d];
      if (dim.score !== null && dim.evidence.length === 0) {
        ctx.addIssue({ code: "custom", path: ["scores", d, "evidence"], message: "A score needs at least one quote as evidence (use null if there is not enough evidence)" });
      }
      dim.evidence.forEach((e, i) => {
        if (!found(e.quote)) ctx.addIssue({ code: "custom", path: ["scores", d, "evidence", i, "quote"], message: "Quote not found in the candidate's answers; copy it exactly" });
      });
    }
    r.top_fixes.forEach((f, i) => {
      if (!found(f.evidence_quote)) ctx.addIssue({ code: "custom", path: ["top_fixes", i, "evidence_quote"], message: "Quote not found in the candidate's answers; copy it exactly" });
    });
  });
}
