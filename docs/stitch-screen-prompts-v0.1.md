# Screen Prompts for Google Stitch (v0.1)

Draft v0.1 · November 14, 2026 · Screens for Interview Me v1

## How to use this

1. Paste the **style block** (section 1) at the top of every prompt so all screens share one look.
2. Generate the screens in the order below. Do the interview room (screen 6) and report (screen 8) first, since they carry the product. The rest can follow.
3. Change one thing at a time when refining (for example, "make the caption panel larger"), rather than rewriting the whole prompt.
4. Connect screens on the canvas to preview the flow as a prototype.
5. Treat exports as design references and starting points. The real components will be built in Next.js against the API design.

## 1. Style block (paste at the top of every prompt)

```
Design a responsive web app, desktop-first, that also works on phones. Calm, professional, focused feel, like a modern developer tool. Light theme with a single indigo accent color, white cards with soft borders and small rounded corners, lots of white space, large readable text, clear visual hierarchy. Clean sans-serif typography. High contrast text and visible focus states for accessibility. No stock photos of people and no cartoon characters. Product name: "MockMate" (placeholder). Use realistic sample content, not lorem ipsum.
```

## 2. Screen prompts

### Screen 1: Landing and sign-in

```
[STYLE BLOCK]
Screen: Landing page with sign-in. Headline: "Practice your developer interview with an AI that has read your projects." Subheadline: one sentence about voice interviews, personalized questions from your resume and GitHub, and a detailed feedback report. A primary button "Continue with Google" and a secondary "Sign in with email". Below, three short feature cards: "Questions from your own projects", "Realistic voice interview", "Feedback with evidence". A small footer line: "Your resume is processed, not stored."
```

### Screen 2: Consent

```
[STYLE BLOCK]
Screen: Consent before first use. Title: "How we handle your data". Plain-language list of what happens: resume and GitHub are processed to create a summary; interview audio is sent to a speech service to be transcribed and is not stored; transcripts and your report are saved to your account; you can delete everything at any time. Show a compact table of services that process data: AI language model provider, speech provider, GitHub (public data only). A checkbox "I understand and agree" and a primary button "Continue". A link "Read the full privacy policy".
```

### Screen 3: Add your context

```
[STYLE BLOCK]
Screen: Onboarding step 1 of 3, "Tell us about you". Three inputs: a drag-and-drop area for a resume PDF (max 5 MB), a text field for GitHub username with helper text "Public repositories only", and an optional multiline field "Paste a job description (optional)". A progress indicator at the top. Primary button "Build my profile". Include a state where the profile is being built, with a progress list: "Reading your resume", "Looking at your GitHub projects", "Preparing your profile".
```

### Screen 4: Review your profile

```
[STYLE BLOCK]
Screen: Onboarding step 2 of 3, "Check what we understood". Show the parsed profile as editable cards: first name, years of experience, skills as removable chips, and a list of projects each with name, one-line description, tech tags, and "your role". Each card has an edit icon. A note "Edit anything that looks wrong so your interview is accurate." Primary button "Looks good", secondary "Re-upload resume".
```

### Screen 5: Interview setup

```
[STYLE BLOCK]
Screen: Onboarding step 3 of 3, "Set up your interview". Selectors: role (Frontend, Backend, Full-stack) as segmented buttons; level (Fresher, 1–3 years); duration as three cards: "Quick, 5 min" selected by default with the text "Project discussion and fundamentals", "Standard, 10 min" marked "Coming soon" with a small coding icon, and "Full, 20 min" marked "Coming soon". A toggle "Show live captions" turned on by default. A microphone check panel with a level meter and a "Test microphone" button, and a note "Works best in Chrome or Edge." Primary button "Start interview". Show "1 free interview left" as a small badge.
```

### Screen 6: Interview room (priority)

```
[STYLE BLOCK]
Screen: Live voice interview room. Minimal and distraction-free. Center: a soft animated circular waveform (not a human face) that shows the interviewer state, with a status label that can read "Interviewer is speaking", "Listening to you", or "Thinking". Top right: a countdown timer "03:42 left" in a pill. Below the waveform: a live captions panel with the interviewer's latest question in bold and the candidate's words appearing underneath in lighter text, with a toggle "Captions" to hide it. Bottom bar: a large primary button "I'm done answering", a secondary "Type instead", and a quiet destructive "End interview". A small connection status indicator at the corner. Show this as the main state, and also include a variant with a banner: "Microphone connection lost. Reconnecting... or switch to typing."
```

### Screen 7: Wrap-up and report loading

```
[STYLE BLOCK]
Screen: Interview finished. Title "Great work, interview complete." Subtext "We're preparing your feedback. This usually takes under a minute." A progress animation and a rotating list of what is happening: "Reviewing your answers", "Finding specific moments", "Writing your top fixes". No buttons until done, then a primary button "View my report".
```

### Screen 8: Feedback report (priority)

```
[STYLE BLOCK]
Screen: Interview feedback report. Top: short summary paragraph and interview details (role, level, duration, date). Section "Scores": four cards for Problem solving, Technical depth, Fundamentals, Communication, each with a score out of 5 shown as filled dots and a one-line rationale; one card shows "Not enough evidence" in a muted style. Section "What went well": two short items. Section "Top 3 things to fix": three numbered cards, each with a title, why it matters, a quoted moment from the interview in a highlighted blockquote, and a "How to improve" line. Section "Practice next": three suggested exercises as checkable items. A small note at the bottom: "A short interview can't assess everything. Scores reflect this conversation only." Buttons: "Practice again" and "View transcript".
```

### Screen 9: Transcript view

```
[STYLE BLOCK]
Screen: Interview transcript. A chat-like layout with interviewer turns on the left and candidate turns on the right, each with a small timestamp. Quotes that the report referenced are highlighted with a small label "Mentioned in report". A sticky header with the interview date and a link back to the report.
```

### Screen 10: History and progress

```
[STYLE BLOCK]
Screen: Dashboard with history. Top: a small line chart "Your progress" with four lines for the four skill scores across interviews. Below: a list of past interviews as rows with date, role, duration, a mini row of four score dots, and a "View report" link. An empty state variant: friendly message and a "Start your first interview" button. A badge showing remaining free interviews and a "Get more interviews" button.
```

### Screen 11: Out of interviews

```
[STYLE BLOCK]
Screen: Quota reached. A friendly modal or page: "You've used your free interview." Short text about what the next step is, with interview pack options as simple cards (placeholder prices) and a secondary link "Maybe later". Keep it low-pressure.
```

### Screen 12: Account and data

```
[STYLE BLOCK]
Screen: Settings. Sections: Profile (name, email), Your data (list of stored items: profile summary, transcripts, reports) with a "Delete all my data" destructive button that opens a confirmation dialog explaining it cannot be undone, and Consent (accepted version and date).
```

## 3. Design notes to check on the generated screens

- The interview room should feel calm. One clear primary action at a time.
- Make state obvious: who is speaking, whether the mic is listening, and how much time is left.
- Captions must be easy to read and easy to hide.
- Use a waveform or orb for the interviewer, not a human face or avatar.
- On the report, show "Not enough evidence" as a normal state, not an error.
- Check that every screen works on a narrow phone width, even though desktop is the main target.
- Look for dark patterns in the quota and payment screen and remove them.

## 4. After generating

- Save the final screens and name them with the same numbers as this list.
- Note anything that needs API data that does not exist yet (for example, a progress chart needs score history). The API design already covers it through `GET /interviews`.
- Send me screenshots if you want a review against the PRD and API design before development.
