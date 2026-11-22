import fs from "node:fs";
import path from "node:path";

export const PROMPT_VERSION = "0.1";
export const INTERVIEWER_PROMPT_VERSION = "0.2";
export type PromptName = "interviewer" | "interviewer-smoke-test" | "plan" | "report" | "profile-resume" | "github-summary";

export function fillTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_m, name: string) => {
    const value = vars[name];
    if (value === undefined) throw new Error(`Missing prompt variable: ${name}`);
    return value;
  });
}

// Wrap untrusted text (resume, README, job description, transcript) so the model treats it as data.
export function wrapData(label: string, text: string): string {
  const safe = text.replace(/<\/?data\b[^>]*>/gi, "[removed tag]");
  return `<data label="${label}">\n${safe}\n</data>`;
}

export function loadPrompt(name: PromptName, vars: Record<string, string> = {}, version = name === "report" ? "0.2" : PROMPT_VERSION): string {
  const file = path.join(process.cwd(), "prompts", `${name}.v${version}.txt`);
  return fillTemplate(fs.readFileSync(file, "utf-8"), vars);
}
