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

Start the local dev server with `npm run dev -- --webpack` when using the Windows setup. The design reference is the [Interview Me Stitch project](https://stitch.google.com/projects/12016856015326599769).
