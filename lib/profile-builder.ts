import { fetchGithubRepos, type GithubWarning, type RepoInfo } from "./github";
import { LlmGithubSchema, ProfileSummarySchema, type GithubSummary, type ProfileSummary } from "./schemas";
import { loadPrompt, wrapData } from "./prompts";
import type { CallContext } from "./llm";

export type Warning = GithubWarning | "resume_text_short";
type Llm = { generateJson: <T>(role: "profile", schema: import("zod").ZodType<T>, input: { system: string; messages: { role: "user"; content: string }[]; ctx?: CallContext }) => Promise<T> };

export const MIN_RESUME_CHARS = 50;

export async function buildProfile(
  input: { resumeText: string; githubUsername?: string; ctx?: CallContext },
  deps: { llm: Llm; fetchImpl?: typeof fetch; githubToken?: string; now?: () => Date },
): Promise<{ summary: ProfileSummary; github_summary: GithubSummary | null; warnings: Warning[] }> {
  const warnings: Warning[] = [];
  if (input.resumeText.length < 300) warnings.push("resume_text_short");

  const summary = await deps.llm.generateJson("profile", ProfileSummarySchema, {
    system: loadPrompt("profile-resume"),
    messages: [{ role: "user", content: wrapData("resume", input.resumeText) }],
    ctx: input.ctx,
  });

  let github_summary: GithubSummary | null = null;
  if (input.githubUsername) {
    const gh = await fetchGithubRepos(input.githubUsername, { fetchImpl: deps.fetchImpl, token: deps.githubToken });
    if (!gh.ok) warnings.push(gh.warning);
    else if (gh.repos.length > 0) {
      const llmOut = await deps.llm.generateJson("profile", LlmGithubSchema, {
        system: loadPrompt("github-summary"),
        messages: [{ role: "user", content: wrapData("repositories", formatRepos(gh.repos)) }],
        ctx: input.ctx,
      });
      github_summary = {
        schema_version: 1,
        fetched_at: (deps.now?.() ?? new Date()).toISOString(),
        // Names, languages, and dates come from GitHub itself; the model only writes the gist and notable points.
        repos: gh.repos.map((r) => {
          const m = llmOut.repos.find((x) => x.name === r.name);
          return { name: r.name, readme_gist: m?.readme_gist ?? "", languages: r.language ? [r.language] : [], notable: m?.notable ?? [], last_pushed: r.pushed_at.slice(0, 10) };
        }),
      };
    }
  }
  return { summary, github_summary, warnings };
}

function formatRepos(repos: RepoInfo[]): string {
  return repos.map((r) => `Repository: ${r.name}\nDescription: ${r.description}\nLanguage: ${r.language ?? "unknown"}\nREADME:\n${r.readme}`).join("\n\n---\n\n");
}
