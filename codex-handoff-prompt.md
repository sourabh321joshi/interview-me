# Interview Me Codex handoff

Paste everything below into the first message of a new Codex thread, with the repository open. The repository root should contain `AGENTS.md`, `README.md`, and a `docs/` folder.

---

You are joining an existing codebase for a solo founder. Read this whole message, then read the files listed in section 1 before doing anything else. Do not change code until you have given me the plan described in section 15.

## 1. Read these first, in this order

1. `AGENTS.md` (project rules, scope lock, review guidelines)
2. `docs/progress.md` (what is done)
3. `docs/ai-interview-platform-v1-prd.md` (product scope, decisions, milestones)
4. `docs/system-design-v0.1.md` (components, flows, state machine, failure handling)
5. `docs/database-design-v0.2.md` (MongoDB collections, indexes, key operations)
6. `docs/api-design-v0.1.md` (endpoints, shapes, errors, limits)
7. `docs/interview-rubric-and-prompts-v0.1.md` (rubric, prompts, test protocol)
8. `README.md` and `docs/m0-checkpoint.md`

The docs are drafts. Where code and docs differ, section 12 lists the known differences. Do not silently "fix" either side: tell me.

## 2. The product

A practice platform where a developer with 0–3 years of experience uploads a resume PDF (and optionally a GitHub username and a job description), then has a timed AI interview and gets a feedback report with evidence quoted from their own answers.

- First audience: developers preparing for JavaScript, React, and Node roles (frontend, backend, full-stack).
- Language: English by default. The interviewer may use a short Hinglish clarification when the candidate struggles, then returns to English.
- Default interview length: 5 minutes ("Quick"). 10 minutes is accepted by the API. 20 minutes is future.
- The interviewer asks about the candidate's own projects, cross-questions based on their answers, and asks 1–2 fundamentals questions. It never invents project details.
- The report scores four dimensions (problem solving, technical depth, fundamentals, communication) from 1 to 5, or `null` when evidence is insufficient, with exact quotes as evidence, plus strengths, exactly 3 fixes, practice suggestions, and limitations. No hire or reject decision.
- Business context: low cost, solo builder, privacy by default (store transcripts and structured summaries only; never store resume PDFs or audio).

## 3. Current state

- **M0 (text-only prototype) is fully coded.** Tasks 0–6 in `docs/m0-build-tasks.md` are done. Typecheck, lint, production build, and 86 tests pass.
- **It has never been run against real services.** All tests use in-memory stores and a fake model. The owner is about to run it with real MongoDB Atlas and OpenAI keys. Expect first-contact problems.
- **M0 checkpoint is pending:** the owner will run 5–10 real interviews and decide go or no-go on question and feedback quality (`docs/m0-checkpoint.md`).
- Authentication does not exist yet. One fixed development user id is used everywhere (`lib/dev-user.ts`). It must never reach production.

## 4. Stack and versions

Node 22, npm, Next.js 16.4 (App Router) with `cacheComponents` enabled, React 19, TypeScript strict, Tailwind 4, MongoDB driver 7 (Atlas), zod 4, OpenAI SDK 7 (Responses API), unpdf for PDF text, Vitest 5, tsx for scripts.

## 5. Code map

- `app/api/v1/**/route.ts`: route handlers (thin: rate limit, parse, call a service, map errors)
- `app/interview/page.tsx`: plain test chat page. `app/report/page.tsx`: report page. Both are intentionally unstyled harnesses. Real designs come later from Google Stitch.
- `lib/db.ts`: one cached `MongoClient`, collection names
- `lib/indexes.ts`: index definitions, applied by `npm run db:indexes`
- `lib/llm/`: model wrapper (`index.ts`), OpenAI provider, pricing, usage sink, types
- `lib/prompts.ts` and `prompts/*.txt`: versioned prompt files, `fillTemplate`, `wrapData`
- `lib/profile-builder.ts`, `profile-service.ts`, `profiles-store.ts`, `pdf.ts`, `github.ts`, `schemas.ts`: profile creation
- `lib/interview-service.ts`, `interview-schemas.ts`, `interview-state.ts`, `interviews-store.ts`: creating and starting interviews, quota, state machine
- `lib/turn-service.ts`: the streaming interview turn engine and the interview view
- `lib/report-service.ts`, `report-schema.ts`, `reports-store.ts`: report generation, quote validation, retries
- `lib/rate-limit.ts`, `route-guard.ts`, `route-errors.ts`, `api-error.ts`: limits and error mapping
- `lib/deps.ts`: builds real dependencies for routes
- `scripts/db-indexes.ts`, `scripts/export-interview.ts`: local tools
- `tests/`: Vitest tests with in-memory test doubles in `tests/helpers/`

## 6. Design decisions you must preserve

1. **Stores are interfaces with Mongo implementations and in-memory test doubles.** Services take their dependencies as arguments. Do not import Mongo directly into services.
2. **Server is the source of truth for time, quota, and state.** `ends_at` is computed on the server. The client timer is display only.
3. **Turns are embedded in the interview document** (`turns` array, `turn_count`). Appends use optimistic concurrency (`turn_count` must equal the expected sequence) and idempotency (`client_turn_id`) in one atomic update.
4. **Quota is reserved atomically at start**, not at create, and refunded if the start update fails.
5. **Time budget for pacing is computed by the server** (`timeBudget`), not taken from the model.
6. **Untrusted text (resume, README, job description, transcript) is always wrapped with `wrapData`** and the prompts tell the model to treat it as data. Structured model output is always validated with zod. Unknown keys are dropped.
7. **Report quotes must appear in something the candidate said** (whitespace and wrapping quote marks are normalized). Validation failures reuse the wrapper's one retry with the issues shown to the model.
8. **Report generation runs after the response** using `after()` from `next/server`, claimed once through the unique index on `reports.interview_id`. A GET on a completed interview with no report, or a report stuck pending for 2 minutes, restarts generation.
9. **Every user-data query filters by `user_id`.** A test scans the store files for this.
10. **Logs contain only fixed text.** A test scans for `console.*` calls with variables.
11. **Provider keys stay server-side.** No `NEXT_PUBLIC_` variables.

## 7. Implemented API (all under `/api/v1`)

| Method and path | Notes |
|---|---|
| `GET /health` | Pings the database |
| `POST /profiles` | multipart: `resume` (PDF, max 5 MB), optional `github_username`, `job_description`. Builds the profile synchronously. Returns `201` with warnings. |
| `GET /profiles/:id`, `PATCH /profiles/:id` | View, and correct the parsed summary (known fields only, `ready` profiles only) |
| `POST /interviews` | `{profile_id, role, level, duration_seconds: 300 or 600, mode}` (mode defaults to `text`). Generates the plan. Status `plan_ready`. |
| `POST /interviews/:id/start` | Reserves a slot, sets `started_at` and `ends_at` |
| `POST /interviews/:id/turns` | Server-sent events. Body `{client_turn_id (uuid), type: open or answer or silence, text?}`. Events: `turn.start`, `text.delta`, `turn.end`, `error`. |
| `GET /interviews/:id` | State, remaining time, transcript. Closes expired interviews. |
| `POST /interviews/:id/end` | Ends a running interview, starts the report |
| `GET /interviews/:id/report` | `200` ready, `202` pending (with `Retry-After`), or failed with `can_regenerate` |
| `POST /interviews/:id/report/regenerate` | Failed reports only. First attempt plus 3 regenerations maximum. |

Every route except health applies a per-user rate limit (60 per minute by default; profile builds 5 per day). Other users' resources return `404 not_found`. Error body: `{error: {code, message, details, request_id}}`.

## 8. Data model (MongoDB)

Collections: `app_users` (created lazily at first start; `_id` equals the user id), `candidate_profiles`, `interviews` (embedded `turns`, `usage_totals`, `expire_at` TTL while unstarted), `reports`, `usage_events` (90-day TTL), `rate_limit_counters` (TTL). Fields are `snake_case`. See `docs/database-design-v0.2.md` and `lib/indexes.ts`.

Interview states: `created`, `plan_ready`, `in_progress`, `wrapping_up`, `completed`, `abandoned`, `failed` (`lib/interview-state.ts`).

## 9. Prompts and model use

- Roles: `profile`, `plan`, `turn`, `report`. Model names come from `MODEL_PROFILE` (falls back to `MODEL_TURN`), `MODEL_PLAN`, `MODEL_TURN`, `MODEL_REPORT`.
- The provider uses the OpenAI Responses API with `store: false`, streaming for turns, `json_object` output for structured calls, one retry for transient errors, and per-role timeouts.
- Usage (tokens, latency, estimated cost) is logged per call and rolled up on the interview. Prices come from `MODEL_PRICES_JSON`; unknown models cost 0 in estimates.
- Prompt version `0.1` is recorded on each interview. If you change a prompt's meaning, bump the version and update `docs/interview-rubric-and-prompts-v0.1.md` so the two stay in sync.
- The interviewer ends the interview by printing `[END_OF_INTERVIEW]`. The server strips it (even when split across stream chunks) and finishes the interview. In the last 30 seconds the server adds a wrap-up note to the last user message.

## 10. Environment variables

`MONGODB_URI`, `MONGODB_DB`, `OPENAI_API_KEY`, `MODEL_PLAN`, `MODEL_TURN`, `MODEL_REPORT`, optional `MODEL_PROFILE`, `MODEL_PRICES_JSON`, `GITHUB_TOKEN`, `FREE_INTERVIEW_LIMIT`, `RATE_GENERAL_PER_MINUTE`, `RATE_PROFILES_PER_DAY`. See `.env.example`. Never commit `.env.local`. Deepgram is not used yet.

## 11. Commands

`npm run dev`, `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `npm run db:indexes`, `npm run export:interview -- <id>`. All checks must pass before you say a task is done.

## 12. Known differences from the docs, and known gaps

- The API design lists endpoints that are not built yet: `GET /me`, `POST /consent`, `DELETE /me`, `GET /profiles`, `DELETE /profiles/:id`, `GET /interviews` (history), `DELETE /interviews/:id`, `/voice/stt-token`, `/voice/tts`.
- No authentication, consent screen, or payments. No voice. No code editor.
- Durations 300 and 600 are both accepted, although the PRD says 10 minutes is "coming soon".
- `interviews.models` stores only `plan`, `turn`, and `report` for now.
- Turns are identified by `seq`, not by an id.
- The system design doc still describes a separate token endpoint and voice proxy that do not exist yet.

**Unverified against real services (look here first when something fails):**
- The Mongo queries in `lib/*-store.ts`, especially `appendTurn`, `reserveSlot`, `claimRetry`, and `createPending`.
- The OpenAI streaming path and `json_object` output with whichever model the owner configured. Newer reasoning models may spend extra tokens and add latency. There is no reasoning-effort setting yet.
- PDF text extraction on complex real resumes (two columns, tables).
- Atlas network access from the owner's machine.

**Gotchas in this stack:**
- Next.js 16 with `cacheComponents`: do not add route segment options such as `dynamic`, `runtime`, or `maxDuration`. Route handlers that use the database are dynamic. Route `params` are Promises.
- `lib/prompts.ts` reads prompt files from disk with `process.cwd()`. A deployment must include the `prompts/` folder.
- Hosting limits to check before deploying: request body size (resume up to 5 MB), Atlas IP allowlist with serverless hosts, and plan terms.
- The lint rule `react-hooks/set-state-in-effect` is on. The pages start async loads from a promise callback inside effects to satisfy it.

## 13. Roadmap (do not build ahead)

- **M0 checkpoint:** run real interviews, judge quality. Current scope.
- **M1:** authentication (Better Auth or Auth.js with the MongoDB adapter, or Clerk; ask me), consent screen, `GET /me`, history list, profile list and delete, account deletion, usage logging review.
- **M2:** voice with Deepgram (speech-to-text via short-lived browser tokens, text-to-speech through a server proxy), live captions, a voice test page first.
- **M3:** browser JavaScript editor and the 10-minute coding option.
- **M4:** progress history, free-interview limits, payments.
- **M5:** testing with 15 real developers.

`AGENTS.md` locks scope to M0. Only I can change that line, after the checkpoint passes.

## 14. Rules

- Follow `AGENTS.md`, including its review guidelines.
- Before using a library API, check the current docs for the installed version. Do not rely on memory.
- Do not add dependencies without saying why. Keep diffs small. Commit per task. Never commit secrets.
- Add tests for new logic, especially ownership, quota, validation, and anything touching prompts or model output.
- If code must deviate from a doc, stop and tell me.
- Do not log prompts, resumes, transcripts, or keys. Do not put secrets in client code.
- Ask me instead of guessing when a decision is open (auth library, pricing, retention, voice settings).
- Explain changes in plain language. I am a solo founder and will review your work myself.

## 15. Your first task (read-only, no feature work)

1. Read the files in section 1.
2. Run `npm install`, `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build`, and report the results.
3. Review for real-service risks without changing code: the Mongo operations and filters in the `*-store.ts` files, the OpenAI Responses API usage and streaming handling in `lib/llm/openai-provider.ts` against the installed SDK's types, PDF extraction handling, and error handling when a service fails.
4. Give me a short plan: any bugs or risks you found ranked by severity, what you would fix first, and which fixes need a decision from me.
5. Wait for my approval before changing anything.

After that, I will run the app with real keys and bring you any errors I hit. Fix those one at a time, with a test for each fix when the problem can be reproduced without real services.
