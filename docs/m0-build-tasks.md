# M0 Build Tasks for Codex (v0.1)

Draft v0.1 · November 14, 2026

## How to use this

1. Create the repo, then put all the documents in `/docs` and `AGENTS.md` in the repo root.
2. Use one Codex thread per task. Start each by asking for a short plan, review it, then ask it to implement.
3. After each task: run the app and tests yourself, read the diff, and commit.
4. If Codex makes the same mistake twice, ask it for a short retrospective and add a rule to `AGENTS.md`.
5. Review these parts yourself, line by line: ownership filters, secret handling, prompt construction, logging.

Start each task prompt with: “Read AGENTS.md and the documents in /docs first. Give me a short plan before changing code.”

## Task 0: Project skeleton

```
Create the Next.js (App Router, TypeScript strict, Tailwind) project skeleton for M0. Add scripts for dev, build, lint, typecheck, and test. Add lib/db.ts with one cached MongoClient reading MONGODB_URI, and a db:indexes script that creates the indexes in database-design-v0.2.md for app_users, candidate_profiles, interviews, reports, usage_events, and rate_limit_counters. Add .env.example (MONGODB_URI, OPENAI_API_KEY, GITHUB_TOKEN optional, MODEL_PLAN, MODEL_TURN, MODEL_REPORT) and .gitignore. Add a fixed development user id helper used until auth exists. Add a /api/v1/health route as in the API design.
Done when: the app runs, health returns ok and checks the database, db:indexes runs twice without errors, tests and typecheck pass.
```

## Task 1: Model wrapper and prompts

```
Create lib/llm with three roles (plan, turn, report). It takes the model name from environment variables, supports streaming for the turn role, applies timeouts and one retry, validates structured outputs with zod, and logs input tokens, output tokens, latency, and estimated cost to usage_events and interviews.usage_totals. Put the interviewer prompt, plan prompt, and report prompt from interview-rubric-and-prompts-v0.1.md into /prompts as versioned files with a loader that fills placeholders.
Done when: unit tests cover placeholder filling, schema validation failure and retry, and usage logging with a mocked provider.
```

## Task 2: Profile builder

```
Implement POST /api/v1/profiles as in api-design-v0.1.md: multipart upload of a resume PDF (max 5 MB), optional github_username and job_description. Extract PDF text, discard the file, fetch the top 3-5 public repos and READMEs from the GitHub API, summarize each with the model wrapper, structure the resume into the summary shape in database-design-v0.2.md, and save to candidate_profiles. Continue with resume only if GitHub fails, and return a warning. Add GET /api/v1/profiles/:id and PATCH to correct the summary. Treat all extracted text as data in prompts.
Done when: tests cover file validation, GitHub failure fallback, and a prompt-injection sample in a resume that must not change the output shape.
```

## Task 3: Create and start an interview

```
Implement POST /api/v1/interviews (validate the profile is ready, generate the plan with the plan role, store it) and POST /api/v1/interviews/:id/start (reserve a slot atomically using the operation in database-design-v0.2.md, set started_at and ends_at, refund on failure). Use the state machine in system-design-v0.1.md. Set expire_at on creation and unset it on start.
Done when: tests cover the quota race (two simultaneous starts with one slot left), invalid state transitions, and ownership.
```

## Task 4: Streaming turns and a chat page

```
Implement POST /api/v1/interviews/:id/turns as a server-sent events stream following api-design-v0.1.md, for type open, answer, and silence. Build the prompt with the fixed prefix and the server-computed [elapsed] line, strip the [END_OF_INTERVIEW] marker and set is_final, enforce time limits and the 40-turn cap, append turns with the optimistic concurrency and idempotency operation from database-design-v0.2.md. Build a simple text chat page that starts an interview, shows streamed replies and a timer from server times, and handles refresh by loading GET /api/v1/interviews/:id.
Done when: tests cover idempotent retries, expired interviews, and the wrap-up instruction near the end.
```

## Task 5: Report

```
Implement POST /api/v1/interviews/:id/end and GET /api/v1/interviews/:id/report. Generate the report with the report role after the response is sent, validate it against the schema, and verify every evidence quote is an exact substring of the transcript. Retry once with the validation errors, then mark failed. Copy scores to the reports.scores fields. Make the GET endpoint start generation if a completed interview has no report or one has been pending too long. Build a simple report page.
Done when: tests cover quote validation failure and retry, null scores, and regeneration limits.
```

## Task 6: Hardening and the M0 checkpoint

```
Add ownership tests across all routes with two users (the dev user and a second test user). Add rate limiting with the counter operation from the database design. Check that no secrets or transcript text appear in logs. Write a README section explaining how to run everything locally.
```

Then run the M0 checkpoint yourself:

- Do 2 practice interviews with your own resume and a few friends.
- Use the survey and transcript checklist in `interview-rubric-and-prompts-v0.1.md`.
- Go or no-go on question and feedback quality before building more.
