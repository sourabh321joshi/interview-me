"use client";

import Link from "next/link";
import { useRef, useState } from "react";

const MAX_RESUME_BYTES = 5 * 1024 * 1024;

type Props = {
  onManual: (job: string) => void;
  onBuild: (form: FormData) => Promise<void>;
  busy: string;
  error: string;
};

export default function AddContext({ onBuild, onManual, busy, error }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [resume, setResume] = useState<File | null>(null);
  const [fileError, setFileError] = useState("");
  const [dragging, setDragging] = useState(false);

  function selectResume(files: FileList | null) {
    if (!files?.length) return;
    const file = files[0];
    if (files.length !== 1) {
      setFileError("Choose one resume PDF.");
    } else if (!/\.pdf$/i.test(file.name) && file.type !== "application/pdf") {
      setFileError("Choose a PDF file.");
    } else if (file.size > MAX_RESUME_BYTES) {
      setFileError("Choose a PDF that is 5 MB or smaller.");
    } else {
      setFileError("");
      setResume(file);
    }
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!resume || busy || fileError) return;
    const form = new FormData(event.currentTarget);
    form.set("resume", resume);
    await onBuild(form);
  }

  return (
    <main className="mx-auto max-w-5xl px-5 pb-12 sm:px-8">
      <header className="border-b border-line py-5">
        <Link href="/" className="font-semibold text-foreground hover:text-indigo-300">Interview Me</Link>
      </header>
      <div className="mx-auto mt-9 max-w-2xl sm:mt-14">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Add your context</h1>
        <p className="mt-3 leading-relaxed text-muted">
          Share your resume so the interviewer can ask about your experience and projects.
        </p>
        <form onSubmit={submit} className="surface mt-7 p-5 sm:p-8">
          <fieldset disabled={!!busy} className="min-w-0 space-y-6">
            <div>
              <p className="mb-2 text-sm font-semibold" id="resume-label">Resume</p>
              <div
                className={`relative rounded-xl border border-dashed p-5 text-center transition-colors sm:p-7 ${dragging ? "border-indigo-400 bg-indigo-500/10" : "border-line bg-background"}`}
                onDragOver={(event) => { event.preventDefault(); if (!busy) setDragging(true); }}
                onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false); }}
                onDrop={(event) => {
                  event.preventDefault();
                  setDragging(false);
                  if (!busy) selectResume(event.dataTransfer.files);
                }}
              >
                <input
                  ref={input} type="file" accept=".pdf,application/pdf" className="hidden"
                  onChange={(event) => {
                    selectResume(event.currentTarget.files);
                    event.currentTarget.value = "";
                  }}
                />
                <button
                  type="button"
                  aria-describedby="resume-hint"
                  onClick={() => input.current?.click()}
                  className="rounded-md text-sm font-semibold text-indigo-300 hover:text-white disabled:opacity-50"
                >
                  {resume ? "Replace PDF" : "Choose PDF"}
                </button>
                {resume ? (
                  <p className="mt-2 break-all text-sm text-foreground" role="status">{resume.name}</p>
                ) : null}
                <p id="resume-hint" className="mt-2 text-sm text-muted">Drag and drop a PDF here. Maximum 5 MB.</p>
              </div>
              {fileError && <p role="alert" className="mt-2 text-sm text-red-300">{fileError}</p>}
            </div>
            <label className="block text-sm font-semibold">
              GitHub username <span className="font-normal text-muted">(optional)</span>
              <input name="github_username" autoCapitalize="none" spellCheck={false} className="field mt-2 font-normal" placeholder="octocat" aria-describedby="github-hint" />
              <span id="github-hint" className="mt-2 block font-normal text-muted">Only public repositories are used.</span>
            </label>
            <label className="block text-sm font-semibold">
              Job description <span className="font-normal text-muted">(optional)</span>
              <textarea name="job_description" rows={4} maxLength={5000} className="field mt-2 font-normal" placeholder="Paste the job description to tailor your interview." />
            </label>
            <div className="flex flex-wrap items-center gap-3 border-t border-line pt-5">
              <button type="submit" className="action" disabled={!resume || !!fileError}>Build my profile</button>
              <button type="button" className="text-sm font-semibold underline" onClick={event => onManual(String(new FormData(event.currentTarget.form!).get("job_description") ?? "").trim())}>Enter profile manually</button>
              <p className="text-sm text-muted">Your resume PDF is discarded after processing.</p>
            </div>
          </fieldset>
          {busy && <p role="status" className="mt-4 text-sm text-indigo-300">{busy}</p>}
          {error && !fileError && <p role="alert" className="mt-4 text-sm text-red-300">{error}</p>}
        </form>
      </div>
    </main>
  );
}
