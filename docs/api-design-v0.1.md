# Interview Me API Design (v0.1)

Draft v0.1 · November 14, 2026 · Companion to System Design v0.1 and Database Design v0.2

Implemented as Next.js route handlers under `/api/v1`. Authentication, sign-in, and sign-out are handled by the chosen auth library (decided in M1) and are not custom endpoints.

## 1. Conventions

- **Format:** JSON requests and responses, except file upload (multipart), streaming turns (server-sent events), and text-to-speech (audio).
- **Authentication:** session cookie issued by the auth library, verified on every route. Unauthenticated calls return `401`.
- **Authorization:** every resource is scoped to the signed-in user. Another user’s resource returns `404`, not `403`, so ids cannot be probed.
- **IDs and times:** string ids (MongoDB ObjectIds as 24-character hex); ISO 8601 UTC timestamps. A malformed id returns `404 not_found`. Client-generated `client_turn_id` values are UUIDs.
- **Versioning:** path prefix `/api/v1`.
- **Request id:** every response has an `x-request-id` header, also included in error bodies.
- **Idempotency:** turn requests carry `client_turn_id`. Repeating the same id returns the stored result.
- **Pagination:** cursor-based, `?limit=20&cursor=...`, response has `next_cursor`.

### Error format

```json
{
  "error": {
    "code": "quota_exceeded",
    "message": "You have used your free interview.",
    "details": {},
    "request_id": "req_123"
  }
}
```

| HTTP | Code | When |
|---|---|---|
| 400 | `validation_failed` | Invalid body, file, or parameter |
| 401 | `unauthenticated` | No valid session |
| 402 | `quota_exceeded` | No free or paid interview slot left |
| 403 | `consent_required` | Consent not accepted for the current version |
| 404 | `not_found` | Missing or not owned |
| 409 | `interview_not_active` | Action not allowed in the current state |
| 409 | `profile_not_ready` | Profile still processing or failed |
| 410 | `interview_expired` | Time limit and grace period passed |
| 413 | `file_too_large` | Resume over the size limit |
| 429 | `rate_limited` | Too many requests; `Retry-After` header set |
| 502 | `upstream_unavailable` | Provider failed after retries; `retryable` in details |
| 500 | `internal` | Unexpected error |

## 2. Endpoint summary

| Method | Path | Purpose |
|---|---|---|
| GET | `/me` | Current user, quota, consent state |
| POST | `/consent` | Accept the current consent version |
| DELETE | `/me` | Delete account and all data |
| POST | `/profiles` | Build a candidate profile from resume and GitHub |
| GET | `/profiles` | List profiles |
| GET | `/profiles/:id` | Get a profile |
| PATCH | `/profiles/:id` | Correct the parsed summary |
| DELETE | `/profiles/:id` | Delete a profile |
| POST | `/interviews` | Create an interview and plan |
| POST | `/interviews/:id/start` | Reserve a slot and start the clock |
| POST | `/interviews/:id/turns` | Send an answer, stream the reply |
| POST | `/interviews/:id/end` | End the interview and start the report |
| GET | `/interviews` | History list |
| GET | `/interviews/:id` | Interview state and transcript |
| DELETE | `/interviews/:id` | Delete an interview |
| GET | `/interviews/:id/report` | Get the report, or its status |
| POST | `/interviews/:id/report/regenerate` | Retry a failed report |
| POST | `/voice/stt-token` | Short-lived speech-to-text token |
| POST | `/voice/tts` | Text-to-speech for one sentence |
| GET | `/health` | Health check (no auth) |

## 3. Account endpoints

### GET `/me`

```json
{
  "id": "6650a1b2c3d4e5f6a7b8c9d0",
  "display_name": "Riya",
  "free_interviews_remaining": 1,
  "paid_credits": 0,
  "consent": {"required_version": "2026-11-v1", "accepted_version": null}
}
```

### POST `/consent`

Request: `{"version": "2026-11-v1", "provider": "OpenAI"}`. The provider matches the one displayed on the consent screen. Response `204`. Records acceptance in `app_users.consents`. Routes that process profile or interview data return `consent_required` until the current terms are accepted.

### DELETE `/me`

Deletes the auth user, which cascades to all data. Response `204`.

## 4. Profiles

### POST `/profiles`

`multipart/form-data`:

| Field | Required | Rules |
|---|---|---|
| `resume` | yes | PDF, up to 5 MB, text must be extractable |
| `github_username` | no | GitHub username format |
| `job_description` | no | Up to 5,000 characters |

Processing can take several seconds. The response is returned when the profile is `ready` or `failed`.

Response `201`:

```json
{
  "id": "6650a1b2c3d4e5f6a7b8c9d0",
  "status": "ready",
  "summary": {"first_name": "Riya", "skills": ["JavaScript", "React"], "projects": []},
  "github": {"included": true, "repos_used": 3},
  "warnings": []
}
```

Warnings can include `github_not_found`, `github_rate_limited`, or `resume_text_short`. If processing fails the profile is saved with `status: "failed"`, and the response is an error with `profile_failed` details.

### PATCH `/profiles/:id`

Lets the user correct the parsed summary before using it. Body is a partial `summary` object. Only `ready` profiles can be edited. Response is the updated profile.

### GET `/profiles`, GET `/profiles/:id`, DELETE `/profiles/:id`

Standard list, read, and delete. Deleting leaves existing interviews intact.

## 5. Interviews

### POST `/interviews`

```json
{
  "profile_id": "6650a1b2c3d4e5f6a7b8c9d0",
  "role": "frontend",
  "level": "fresher",
  "duration_seconds": 300,
  "mode": "voice"
}
```

Validates the profile (`ready`) and consent, generates the plan, and returns `201`:

```json
{
  "id": "6650a1b2c3d4e5f6a7b8c9d0",
  "status": "plan_ready",
  "role": "frontend",
  "level": "fresher",
  "duration_seconds": 300,
  "mode": "voice"
}
```

The plan is stored server-side and not returned to the client. No quota is used at this point.

### POST `/interviews/:id/start`

Reserves a slot atomically, sets `started_at` and `ends_at`, and moves the interview to `in_progress`.

```json
{
  "id": "6650a1b2c3d4e5f6a7b8c9d0",
  "status": "in_progress",
  "started_at": "2026-11-14T10:00:00Z",
  "ends_at": "2026-11-14T10:05:00Z",
  "server_now": "2026-11-14T10:00:00Z"
}
```

Errors: `quota_exceeded`, `interview_not_active` (already started), `consent_required`.

### POST `/interviews/:id/turns` (streaming)

Sends the candidate’s input and streams the interviewer’s reply. Use `fetch` with a readable stream on the client. `EventSource` only supports GET.

Request:

```json
{
  "client_turn_id": "3b9f6c1e-8a42-4d55-9a0e-2f7c1d5b6e80",
  "type": "answer",
  "text": "I used Socket.IO because ..."
}
```

| `type` | Meaning | `text` |
|---|---|---|
| `open` | Ask for the opening question; send once after start | not allowed |
| `answer` | Candidate’s spoken or typed answer | required, up to 2,000 characters |
| `silence` | Candidate has been silent; AI offers help | not allowed |
| `code` | Candidate’s code and output (Standard option, later) | code field instead |

Response: `200` with `Content-Type: text/event-stream`.

```
event: turn.start
data: {"seq":4,"phase":"project","remaining_seconds":212}

event: text.delta
data: {"text":"That sounds interesting. "}

event: text.delta
data: {"text":"Why did you choose Socket.IO over plain WebSockets?"}

event: turn.end
data: {"seq":5,"text":"That sounds interesting. Why did you choose Socket.IO over plain WebSockets?","is_final":false,"remaining_seconds":205}
```

Error during the stream:

```
event: error
data: {"code":"upstream_unavailable","message":"Please try again.","retryable":true}
```

Behavior:

- The candidate turn is saved before the model is called. The interviewer turn is saved when the stream completes.
- Time is computed on the server. After `ends_at` plus grace, the call returns `410 interview_expired`.
- Near the end the server instructs the model to wrap up. When the model finishes, `turn.end` has `is_final: true` and the interview moves to `completed` with `end_reason: "model_finished"`.
- Repeating a `client_turn_id` returns a single `turn.end` event with the stored reply and no deltas.
- `phase` is one of `opening`, `project`, `fundamentals`, `wrapup`.

### POST `/interviews/:id/end`

Body: `{"reason": "user_ended"}`. Marks the interview completed and starts report generation. Response `202`:

```json
{"status": "completed", "report_status": "pending"}
```

Calling it on an already completed interview returns the same response.

### GET `/interviews`

Query: `limit`, `cursor`. Response:

```json
{
  "items": [
    {
      "id": "6650a1b2c3d4e5f6a7b8c9d0",
      "created_at": "2026-11-14T10:00:00Z",
      "role": "frontend",
      "level": "fresher",
      "duration_seconds": 300,
      "status": "completed",
      "scores": {"problem_solving": 3, "technical_depth": 3, "fundamentals": 2, "communication": 4}
    }
  ],
  "next_cursor": null
}
```

### GET `/interviews/:id`

Returns state, times, remaining seconds, and the transcript so far, which lets the client resume after a refresh.

```json
{
  "id": "6650a1b2c3d4e5f6a7b8c9d0",
  "status": "in_progress",
  "mode": "voice",
  "started_at": "2026-11-14T10:00:00Z",
  "ends_at": "2026-11-14T10:05:00Z",
  "remaining_seconds": 140,
  "turns": [
    {"seq": 0, "speaker": "interviewer", "text": "Hi Riya ...", "t_offset_ms": 0},
    {"seq": 1, "speaker": "candidate", "text": "Hi ...", "t_offset_ms": 6200}
  ]
}
```

### DELETE `/interviews/:id`

Deletes the interview, its turns, and its report. Response `204`.

## 6. Reports

### GET `/interviews/:id/report`

- `200` with the full report when `status` is `ready`.
- `202` with `{"status": "pending"}` and a `Retry-After` header while generating.
- `200` with `{"status": "failed", "can_regenerate": true}` if generation failed.
- If the interview is completed and no report exists, or one has been pending too long, this call starts generation.

Ready response:

```json
{
  "status": "ready",
  "rubric_version": "0.1",
  "summary": "Two or three sentences",
  "scores": {
    "problem_solving": {"score": 3, "rationale": "", "evidence": [{"quote": "", "note": ""}]},
    "technical_depth": {"score": 3, "rationale": "", "evidence": []},
    "fundamentals": {"score": null, "rationale": "Not enough evidence", "evidence": []},
    "communication": {"score": 4, "rationale": "", "evidence": []}
  },
  "strengths": ["", ""],
  "top_fixes": [
    {"title": "", "why_it_matters": "", "evidence_quote": "", "how_to_improve": ""}
  ],
  "suggested_practice": ["", "", ""],
  "limitations": "What a short interview cannot assess"
}
```

### POST `/interviews/:id/report/regenerate`

Only for `failed` reports, limited to a few attempts per interview. Response `202`.

## 7. Voice

### POST `/voice/stt-token`

Request: `{"interview_id": "6650a1b2c3d4e5f6a7b8c9d0"}`. The interview must be `in_progress`. Calls Deepgram’s token endpoint with the server key and returns:

```json
{
  "access_token": "short-lived token",
  "expires_in": 30,
  "ws_url": "wss://api.deepgram.com/v1/listen",
  "connect_params": {
    "model": "nova-3",
    "language": "en",
    "interim_results": true,
    "endpointing": 400,
    "keyterms": ["Socket.IO", "TaskFlow"]
  }
}
```

The client opens the WebSocket with this token. The connection can stay open after the token expires. Request a new token whenever it reconnects. The language value and endpointing value are placeholders to be settled in the voice spike. Limit tokens per interview to a small number to stop abuse.

### POST `/voice/tts`

Request:

```json
{"interview_id": "6650a1b2c3d4e5f6a7b8c9d0", "text": "Why did you choose Socket.IO?", "seq": 5}
```

Response: `200` audio stream. The format is decided in the voice spike. The server checks that the interview is active, that `text` is up to 500 characters, and that the per-interview character budget is not exceeded, then calls Deepgram’s text-to-speech with the server key and logs usage. On budget exhaustion it returns `429 rate_limited` and the client falls back to browser speech synthesis.

## 8. Health

`GET /health` returns `{"status": "ok", "time": "..."}` and checks that the database is reachable. No authentication.

## 9. Limits and defaults (all tunable)

| Item | Default |
|---|---|
| Resume file size | 5 MB |
| Job description length | 5,000 characters |
| Candidate answer length | 2,000 characters |
| Turns per interview | 40 |
| Text-to-speech characters per interview | 6,000 |
| Speech-to-text tokens per interview | 5 |
| Profile builds per user per day | 5 |
| Report regenerations per interview | 3 |
| Grace period after `ends_at` | 15 seconds |
| Requests per user per minute (general) | 60 |

## 10. Next.js implementation notes

- Use the Node.js runtime for all routes that use PDF parsing, provider SDKs, or streaming.
- Set `maxDuration` per route: short for turns and voice, longer for profile building and report generation. Check the host’s current limits at build time.
- Validate every request body with a schema library and return `validation_failed` with field-level details.
- Wrap each handler in shared middleware for authentication, request id, rate limiting, consent check, and error formatting.
- Generate an OpenAPI description from the schemas later if a second client or external integration appears.

## 11. Open decisions

- Whether profile building should become asynchronous with polling if it proves slow.
- Final audio format and Deepgram voice for `/voice/tts`.
- Whether `silence` turns are worth including in v1 or can wait.
- Whether to add response caching for history and report reads if traffic grows.
