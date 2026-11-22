import { buildReportSchema } from "../lib/report-schema";
import { createLlm } from "../lib/llm";
import { createGeminiProvider } from "../lib/llm/gemini-provider";
import { LlmError, type LlmProvider, type UsageEvent } from "../lib/llm/types";
import { loadPrompt, wrapData } from "../lib/prompts";

const interviewId = process.env.GEMINI_DIAGNOSTIC_INTERVIEW_ID;
const baseUrl = process.env.GEMINI_DIAGNOSTIC_BASE_URL ?? "http://127.0.0.1:3000";
const model = process.env.GEMINI_MODEL_REPORT ?? "gemini-3.1-flash-lite";
const maxRequests = 2;

if (!interviewId) throw new Error("Set GEMINI_DIAGNOSTIC_INTERVIEW_ID to a synthetic interview id.");

async function main() {
  const response = await fetch(`${baseUrl}/api/v1/interviews/${interviewId}`);
  if (!response.ok) throw new Error(`Could not load synthetic interview (${response.status}).`);
  const interview = await response.json() as {
    role: string;
    level: string;
    turns: Array<{ speaker: string; kind: string; text: string }>;
  };
  const answers = interview.turns.filter((turn) => turn.speaker === "candidate" && turn.kind !== "system").map((turn) => turn.text);
  const transcript = interview.turns.map((turn) =>
    turn.speaker === "interviewer" ? `Interviewer: ${turn.text}` : turn.kind === "system" ? "Candidate: [silent]" : `Candidate: ${turn.text}`,
  ).join("\n");
  const events: UsageEvent[] = [];
  const gemini = createGeminiProvider();
  let requestCount = 0;
  const provider: LlmProvider = {
    name: gemini.name,
    async generate(req) {
      if (requestCount >= maxRequests) throw new LlmError("invalid_output", `Diagnostic limited to ${maxRequests} Gemini requests`);
      requestCount++;
      return gemini.generate(req);
    },
    stream: (req) => gemini.stream(req),
  };
  const llm = createLlm({
    provider,
    sink: { async record(event) { events.push(event); } },
    models: () => model,
  });

  try {
    const report = await llm.generateJson("report", buildReportSchema(answers), {
      system: loadPrompt("report", {
        role_and_level: `${interview.role}, ${interview.level}`,
        transcript: wrapData("transcript", transcript),
      }),
      messages: [{ role: "user", content: "Evaluate the interview and return the report JSON now." }],
    });
    console.log(JSON.stringify({ status: "ready", model, requests: requestCount, token_events: events.length, scores: report.scores, top_fix_titles: report.top_fixes.map((fix) => fix.title) }));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.log(JSON.stringify({ status: "failed", model, requests: requestCount, token_events: events.length, error: message }));
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Diagnostic failed");
  process.exitCode = 1;
});
