import { buildReportSchema } from "../lib/report-schema";
import { createLlm } from "../lib/llm";
import { createGeminiProvider } from "../lib/llm/gemini-provider";
import { LlmError, type LlmProvider, type UsageEvent } from "../lib/llm/types";
import { loadPrompt, wrapData } from "../lib/prompts";

const model = process.env.GEMINI_MODEL_REPORT ?? "gemini-3.1-flash-lite";
const answers = [
  "I chose server-side validation because clients can be bypassed. I added a regression test so empty task titles stay rejected.",
  "MongoDB keeps tasks after a restart. I would add an index for the owner and creation date so listing tasks stays fast as data grows.",
];
const transcript = [
  "Interviewer: Why did you validate task titles on the server, and how did you test it?",
  `Candidate: ${answers[0]}`,
  "Interviewer: Why did you use MongoDB, and how would you keep task listing fast as the app grows?",
  `Candidate: ${answers[1]}`,
].join("\n");
const events: UsageEvent[] = [];
const gemini = createGeminiProvider();
let requestCount = 0;
const maxRequests = 2;
const provider: LlmProvider = {
  name: gemini.name,
  async generate(req) {
    if (requestCount >= maxRequests) throw new LlmError("invalid_output", `Diagnostic is limited to ${maxRequests} Gemini requests`);
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
  onValidationFailure: (failure) => console.log(JSON.stringify(failure)),
});

async function main() {
  await llm.generateJson("report", buildReportSchema(answers), {
    system: loadPrompt("report", {
      role_and_level: "frontend, fresher",
      transcript: wrapData("transcript", transcript),
    }),
    messages: [{ role: "user", content: "Evaluate the interview and return the report JSON now." }],
  });

  console.log(`Gemini report smoke test passed (${model}).`);
  console.log(`Quote/schema validation passed; ${requestCount} provider call(s).`);
}

main().catch((error: unknown) => {
  const reason = error instanceof LlmError ? error.code : "unknown";
  console.error(`Gemini report smoke test failed (${reason}).`);
  process.exitCode = 1;
}).finally(() => {
  for (const [index, event] of events.entries()) {
    console.log(`Attempt ${index + 1}: ${event.input_tokens} input tokens, ${event.output_tokens} output tokens.`);
  }
});
