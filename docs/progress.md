# Build progress

M0 tasks (see m0-build-tasks.md):

- [x] Task 0: project skeleton (db client, indexes, dev user, error helper, health route)
- [x] Task 1: model wrapper and prompts (OpenAI Responses API, zod-validated JSON, usage logging)
- [x] Task 2: profile builder (PDF text, GitHub fetch, zod-validated summary, POST/GET/PATCH routes)
- [x] Task 3: create and start an interview (plan generation, atomic slot reservation, state checks)
- [x] Task 4: streaming turns, idempotent turn saving, timing, GET interview, test chat page at /interview
- [x] Task 5: report (end interview, quote-validated report, regeneration limits, report page at /report)
- [x] Task 6: hardening (rate limits, cross-route ownership tests, log and source guardrail tests, README, export tool)
- [ ] M0 checkpoint: run real interviews with real keys, see docs/m0-checkpoint.md

## Interview Me frontend

- [x] Dark landing page and shared Tailwind styles.
- [x] Add your context with resume upload, optional GitHub and job description, and profile build status.
- [x] Review your profile with editable extracted fields, a save through the existing profile API, and warnings for resume extraction and GitHub fallback.
- [x] Interview setup with role, experience level, and 5- or 10-minute duration, plus a 1-minute default in local development for smoke testing. A retry of a failed start can reuse the generated plan.
- [x] Live text interview room with countdown, streaming replies, transcript, retry, explicit stop requests, hidden timing tags, and feedback handoff.
- [x] Interview wrap-up with report-loading status and a View my report action when feedback is ready.
- [x] Dark feedback report with interview details, four rubric scores, evidence, three fixes, a practice checklist, and transcript navigation.
- [x] Interview transcript with timestamps, highlighted evidence quotes, and a link back to feedback.

A live text interview with a synthetic resume has previously worked end to end. The latest frontend flows are verified using local mocks. Get the owner's permission before any test that spends OpenAI tokens.

For Gemini experimentation, `npm run test:gemini-report` uses a fixed fictional transcript, validates the response with the report schema and quote checks, keeps usage only in memory, and does not write to MongoDB. App routes can select Gemini with `LLM_PROVIDER=gemini`; this has no automatic OpenAI fallback. Use only synthetic data with Gemini's free tier, which may use prompts and responses to improve Google's products.

A local synthetic one-minute smoke check on 2026-11-22 returned health `ok`; profile creation, interview planning, and turns succeeded through Gemini. Report generation failed with `invalid_output` after schema validation retry. The synthetic profile, interview, report, and usage events were deleted afterward. The formal M0 checkpoint remains open.

A second synthetic one-minute run with the updated Gemini key had the same `invalid_output` report failure. `GEMINI_DIAGNOSTIC_INTERVIEW_ID=<synthetic-id> npm run diagnose:gemini-report` replayed that run's exact transcript and passed quote/schema validation on its second Gemini call. The resulting feedback called the fixed answers off-topic; because the test script did not adapt its answers to the generated questions, that quality score is not meaningful. The second run's synthetic records and usage events were deleted. M0 remains open for prompt investigation and participant testing.

Both Gemini report diagnostics now print the failed attempt, validation category, and schema field paths without printing the transcript or generated report. The isolated fictional transcript passed on its first request (596 input tokens and 929 output tokens). The app report failure has not been reproduced with this instrumentation.

Start the local dev server with `npm run dev -- --webpack` when using the Windows setup. The design reference is the [Interview Me Stitch project](https://stitch.google.com/projects/12016856015326599769).

A third fictional one-minute app run reproduced the report failure. On replay both attempts failed quote validation at top_fixes[0].evidence_quote. Report prompt v0.2 specifies how to copy evidence from candidate answers. Regenerating the same interview through the app returned ready and all seven evidence quotes matched. This run is available locally for review. M0 participant testing remains open.

A fresh fictional one-minute Gemini app run after report prompt v0.2 produced a ready report on its first generation. All seven evidence quotes matched candidate answers. The run used the bundled fictional resume. M0 participant quality checkpoint remains open.

A second fictional one-minute run after report prompt v0.2 failed during initial app report generation. Replaying its transcript with diagnose:gemini-report passed on the first request. Regenerating the report in the app returned ready. This indicates report generation remains inconsistent across calls. M0 participant quality checkpoint remains open.
