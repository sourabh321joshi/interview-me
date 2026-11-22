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

To continue in a new chat: upload the project (without node_modules), this file, and the docs, and ask for the next unchecked task.
