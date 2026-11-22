import { buildReportSchema } from "../lib/report-schema";
import { createLlm } from "../lib/llm";
import { createGeminiProvider } from "../lib/llm/gemini-provider";
import { LlmError, type LlmProvider, type UsageEvent } from "../lib/llm/types";
import { loadPrompt, wrapData } from "../lib/prompts";

const model = process.env.GEMINI_MODEL_REPORT ?? "gemini-3.1-flash-lite";
const answers = [
  "For duplicate requests, I would use an idempotency key and store the first response so retries do not create duplicate work.",
  "A database index speeds up reads for indexed fields, but it adds storage and makes writes a little slower.",
  "I would reproduce the bug, add a regression test, then inspect the logs around the failing request before changing code.",
];
const transcript = answers.map((answer) => `Candidate: ${answer}`).join("\n");
const events: UsageEvent[] = [];
const gemini = createGeminiProvider();
let requestCount = 0;
const provider: LlmProvider = {
  name: gemini.name,
  async generate(req) {
    if (requestCount > 0) throw new LlmError("invalid_output", "Smoke test is limited to one Gemini request");
    requestCount++;
    return gemini.generate(req);
  },
  stream: (req) => gemini.stream(req),
};
const llm = createLlm({
  provider,
  // Keep this fixture run isolated: no MongoDB writes and no transcript logging.
  sink: { async record(event) { events.push(event); } },
  models: () => model,
});

async function main() {
  const report = await llm.generateJson("report", buildReportSchema(answers), {
    system: loadPrompt("report", {
      role_and_level: "junior JavaScript developer",
      transcript: wrapData("transcript", transcript),
    }),
    messages: [{ role: "user", content: "Evaluate the fictional interview and return the report JSON now." }],
  });

  console.log(`Gemini report smoke test passed (${model}).`);
  console.log(`Quote/schema validation passed; ${requestCount} provider call(s).`);
  if (events[0]) console.log(`Tokens: ${events[0].input_tokens} input, ${events[0].output_tokens} output.`);
  console.log(JSON.stringify({ summary: report.summary, scores: report.scores, top_fixes: report.top_fixes }, null, 2));
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown Gemini test error";
  console.error(`Gemini report smoke test failed: ${message}`);
  process.exitCode = 1;
});
