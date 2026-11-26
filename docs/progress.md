# Build progress

M0 tasks (see m0-build-tasks.md):

- [x] Task 0: project skeleton (db client, indexes, dev user, error helper, health route)
- [x] Task 1: model wrapper and prompts (OpenAI Responses API, zod-validated JSON, usage logging)
- [x] Task 2: profile builder (PDF text, GitHub fetch, zod-validated summary, POST/GET/PATCH routes)
- [x] Task 3: create and start an interview (plan generation, atomic slot reservation, state checks)
- [x] Task 4: streaming turns, idempotent turn saving, timing, GET interview, test chat page at /interview
- [x] Task 5: report (end interview, quote-validated report, regeneration limits, report page at /report)
- [x] Task 6: hardening (rate limits, cross-route ownership tests, log and source guardrail tests, README, export tool)
- M0 checkpoint: owner tested with friends and waived the formal five-developer minimum. Quality targets were not formally measured.

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

## M1 web app foundations

- [x] Sign-in: select the auth library, implement sign-in and sign-out, and enforce session ownership on protected routes.

Self-hosted Better Auth email registration, sign-in, sign-out, and session ownership are implemented. Local API verification covered a fictional account, authenticated access, and 401 responses after sign-out. The owner confirmed Google sign-in worked locally.

M1 consent records the accepted version and active processors before profile building or interview processing. Changing the AI provider requires fresh consent. The owner approved a 30-day transcript and report retention target, with interview deletion and account deletion. Manual interview and account deletion remain open.

The 30-day retention rule is active in the development database. Eight interviews received deadlines and none were due immediately. An expired synthetic transcript and report were both removed by MongoDB, and the expired interview was inaccessible during cleanup. Reports show the expiry date and consent v2 explains the policy.

Users can delete an interview from its feedback page. Deletion removes the interview, including its transcript, and the report in one transaction. Account deletion remains open.

Account deletion is available from the signed-in Account page. A fictional account verified deletion of app records, session revocation, and preservation of another account’s data. Usage events retain counts with their account and interview identifiers cleared.

Basic interview history lists the signed-in user’s unexpired attempts with available rubric scores and links to feedback. Older attempts can be loaded with the history cursor.

The signed-in account status endpoint returns the display name, remaining free interviews, paid credits, and consent status for the active processors.

## M2 voice

A one-minute local microphone test is available at /voice-test with simulated captions and an on-device interviewer voice sample where supported. Live transcription accuracy and latency still need a provider-backed test.

The voice test page now offers opt-in live captions using an authenticated temporary Deepgram token. Local Edge testing with a disposable account reached token issuance. Deepgram returned 403 FORBIDDEN for the configured key, so live microphone transcription is pending a key with Member permission.

After the key update, a signed-in Edge test streamed synthetic microphone audio and displayed the live caption 'Caching to improve'. The test stopped early and the disposable account was deleted. Hinglish accuracy and latency on a real microphone remain unmeasured.

Active interviews now support optional dictation into the editable answer draft. Finalized phrases append to typed text and the candidate explicitly sends the reviewed answer. Voice grants require ownership, current consent and remaining interview time, with five attempts per interview.

Verified a disposable one-minute interview in Edge with synthetic microphone audio. Dictation populated the answer textarea and Send became available after stopping. The draft was left unsent and the disposable account was deleted.

Profile recovery: provider HTTP status is preserved on future failed builds. Users can enter a profile through the existing editor without AI generation, and failure of optional GitHub summarization preserves a successful resume summary.

Interview planning now retries a Gemini 503 once after a short delay, using the existing model wrapper. Persistent service unavailability and provider quota errors are distinguished in API responses.

Gemini can now use GEMINI_FALLBACK_MODEL on the existing single retry after a 503. The development fallback, gemini-3.5-flash-lite, returned a successful synthetic response. Usage events record the responding model.

The interview answer editor now uses the full width, grows with the draft on supported browsers, and shows the character count. Dictation and Send are grouped beneath the draft.

The interview room now has a Live captions checkbox, enabled by default. It controls streaming interviewer text and interim dictation without interrupting recording, editing, or access to completed turns.

The interview room can play the latest completed interviewer question with an on-device English voice. Playback and microphone capture are mutually exclusive. Deepgram Aura voice and audio format selection remain open.

A disposable one-minute interview in Edge verified first-click playback, Stop playback, replay to completion, and microphone control locking. Device voice loading starts when the room mounts. The test used a prewritten question and no AI API calls.

The voice test offers opt-in Asteria and Luna Aura MP3 previews of a fixed UPI question. Replays reuse the sample while the page is open. Interview voice selection awaits listening feedback.

Interview setup offers opt-in automatic Luna playback of completed interviewer questions. The proxy verifies ownership and question text, reserves a 6,000-character budget, and logs usage. Candidates can stop Luna or use device playback if audio is unavailable.

Automated tests verified that Luna requests sentences in order and releases dictation after the last simulated audio clip. End-to-end audible interview playback remains unverified.

Luna now queues authorized sentences as reply text streams. The one-minute simulated test verifies that the first sentence is available before the next text chunk. Browser performance records the time from requesting a turn to starting its first audio clip as interview-first-audio.
