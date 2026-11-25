"use client";

import Link from "next/link";
import { useState } from "react";
import type { Warning } from "@/lib/profile-builder";
import { ProfilePatchSchema, type ProfileSummary } from "@/lib/schemas";

type ProfileFields = Omit<ProfileSummary, "schema_version">;
type Draft = Omit<ProfileFields, "skills" | "projects"> & {
  skills: string;
  projects: (Omit<ProfileFields["projects"][number], "tech"> & { tech: string })[];
};
type Props = {
  summary: ProfileSummary;
  warnings?: Warning[];
  busy: boolean;
  error: string;
  onContinue: (changes: Partial<ProfileFields>) => Promise<void>;
  onBack: () => void;
};

const WARNING_MESSAGES: Record<Warning, string> = {
  github_summary_unavailable: "Your resume profile is ready. The AI provider could not summarize your GitHub repositories.",
  github_not_found: "We couldn’t find that GitHub profile. We used your resume to build this profile.",
  github_rate_limited: "GitHub temporarily limited requests. We used your resume to build this profile.",
  github_unavailable: "We couldn’t reach GitHub. We used your resume to build this profile.",
  resume_text_short: "We could only extract a small amount of text from your resume. Check that your skills and projects are complete.",
};

const list = (value: string) => value.split(",").map((item) => item.trim()).filter(Boolean);

function TextField({ label, value, limit, onChange, multiline }: {
  label: string; value: string; limit?: number; onChange: (value: string) => void; multiline?: boolean;
}) {
  const props = { value, maxLength: limit, className: "field mt-2 font-normal", onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange(event.target.value) };
  return (
    <label className="block text-sm font-semibold">
      {label}
      {multiline ? <textarea {...props} rows={3} /> : <input {...props} />}
    </label>
  );
}

function NumberField({ label, value, min, max, step = 1, onChange }: {
  label: string; value: number | null; min: number; max: number; step?: number | "any"; onChange: (value: number | null) => void;
}) {
  return (
    <label className="block text-sm font-semibold">
      {label}
      <input type="number" value={value ?? ""} min={min} max={max} step={step} className="field mt-2 font-normal"
        onChange={(event) => onChange(event.target.value === "" ? null : event.target.valueAsNumber)} />
    </label>
  );
}

function Entries<T>({ title, singular, items, max, blank, onChange, children }: {
  title: string; singular: string; items: T[]; max: number; blank: T; onChange: (items: T[]) => void;
  children: (item: T, update: (item: T) => void) => React.ReactNode;
}) {
  return (
    <section className="surface space-y-4 p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">{title}</h2>
        <button type="button" disabled={items.length >= max} className="text-sm font-semibold text-indigo-300 underline disabled:opacity-50"
          onClick={() => onChange([...items, blank])}>Add {singular}</button>
      </div>
      {items.length === 0 && <p className="text-sm text-muted">None found. You can add an entry if it’s relevant.</p>}
      {items.map((item, index) => (
        <fieldset key={index} className="min-w-0 space-y-3 rounded-lg border border-line p-4">
          <legend className="px-1 text-sm font-semibold capitalize">{singular} {index + 1}</legend>
          {children(item, (updated) => onChange(items.map((entry, i) => i === index ? updated : entry)))}
          <button type="button" className="text-sm text-muted underline hover:text-red-300"
            onClick={() => onChange(items.filter((_, i) => i !== index))}>Remove {singular} {index + 1}</button>
        </fieldset>
      ))}
    </section>
  );
}

export default function ReviewProfile({ summary, warnings = [], busy, error, onContinue, onBack }: Props) {
  const [draft, setDraft] = useState<Draft>(() => ({
    ...summary,
    skills: summary.skills.join(", "),
    projects: summary.projects.map((project) => ({ ...project, tech: project.tech.join(", ") })),
  }));
  const [validationError, setValidationError] = useState("");

  function update<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const fields: ProfileFields = {
      first_name: draft.first_name,
      years_experience: draft.years_experience,
      skills: list(draft.skills),
      projects: draft.projects.map((project) => ({ ...project, tech: list(project.tech) })),
      experience: draft.experience,
      education: draft.education,
    };
    const changes = Object.fromEntries(Object.entries(fields).filter(([key, value]) =>
      JSON.stringify(value) !== JSON.stringify(summary[key as keyof ProfileFields])
    ));
    setValidationError("");
    if (Object.keys(changes).length === 0) return onContinue({});
    const parsed = ProfilePatchSchema.safeParse(changes);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      setValidationError(`Check ${issue.path.join(" ").replaceAll("_", " ")}. ${issue.message}`);
      return;
    }
    await onContinue(parsed.data);
  }

  return (
    <main className="mx-auto max-w-4xl px-5 pb-12 sm:px-8">
      <header className="border-b border-line py-5">
        <Link href="/" className="font-semibold hover:text-indigo-300">Interview Me</Link>
      </header>
      <form onSubmit={submit} className="mx-auto mt-9 max-w-2xl sm:mt-12">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Review your profile</h1>
        <p className="mt-3 text-muted">Check what we took from your resume. Edit anything you’d like the interviewer to get right.</p>
        {warnings.length > 0 && (
          <section aria-labelledby="profile-notes" className="mt-5 rounded-lg border border-amber-400/30 bg-amber-500/10 px-4 py-3">
            <h2 id="profile-notes" className="text-sm font-semibold text-amber-200">Profile notes</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-relaxed text-muted">
              {warnings.map((warning) => <li key={warning}>{WARNING_MESSAGES[warning]}</li>)}
            </ul>
          </section>
        )}
        <fieldset disabled={busy} className="mt-7 min-w-0 space-y-5">
          <section className="surface space-y-4 p-5 sm:p-6">
            <h2 className="text-lg font-semibold">About you</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField label="First name" limit={50} value={draft.first_name} onChange={(value) => update("first_name", value)} />
              <NumberField label="Years of experience" value={draft.years_experience} min={0} max={40} step="any" onChange={(value) => update("years_experience", value ?? 0)} />
            </div>
            <TextField label="Skills, separated by commas" value={draft.skills} onChange={(value) => update("skills", value)} />
          </section>

          <Entries title="Projects" singular="project" items={draft.projects} max={8} blank={{ name: "", description: "", role: "", tech: "" }}
            onChange={(value) => update("projects", value)}>
            {(project, change) => <>
              <TextField label="Project name" limit={100} value={project.name} onChange={(name) => change({ ...project, name })} />
              <TextField label="Description" limit={300} value={project.description} onChange={(description) => change({ ...project, description })} multiline />
              <TextField label="Your role" limit={200} value={project.role} onChange={(role) => change({ ...project, role })} />
              <TextField label="Technologies, separated by commas" value={project.tech} onChange={(tech) => change({ ...project, tech })} />
            </>}
          </Entries>

          <Entries title="Experience" singular="experience" items={draft.experience} max={8}
            blank={{ company: "", title: "", months: 0, notes: "" }} onChange={(value) => update("experience", value)}>
            {(job, change) => <>
              <TextField label="Company" limit={100} value={job.company} onChange={(company) => change({ ...job, company })} />
              <TextField label="Job title" limit={100} value={job.title} onChange={(title) => change({ ...job, title })} />
              <NumberField label="Months" min={0} max={600} value={job.months} onChange={(months) => change({ ...job, months: months ?? 0 })} />
              <TextField label="Notes" limit={300} value={job.notes} onChange={(notes) => change({ ...job, notes })} multiline />
            </>}
          </Entries>

          <Entries title="Education" singular="qualification" items={draft.education} max={5}
            blank={{ degree: "", year: null }} onChange={(value) => update("education", value)}>
            {(item, change) => <>
              <TextField label="Degree or qualification" limit={100} value={item.degree} onChange={(degree) => change({ ...item, degree })} />
              <NumberField label="Year (optional)" min={1950} max={2100} value={item.year} onChange={(year) => change({ ...item, year })} />
            </>}
          </Entries>
          <div className="flex flex-wrap items-center gap-4">
            <button type="submit" className="action">{busy ? "Saving your profile…" : "Save and continue"}</button>
            <button type="button" className="text-sm font-semibold text-indigo-300 underline" onClick={onBack}>Change context</button>
          </div>
        </fieldset>
        {(validationError || error) && <p role="alert" className="mt-4 text-sm text-red-300">{validationError || error}</p>}
      </form>
    </main>
  );
}
