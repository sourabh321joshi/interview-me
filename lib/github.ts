import { GithubUsernameSchema } from "./schemas";

export type RepoInfo = { name: string; description: string; language: string | null; pushed_at: string; readme: string };
export type GithubWarning = "github_not_found" | "github_rate_limited" | "github_unavailable";
export type GithubResult = { ok: true; repos: RepoInfo[] } | { ok: false; warning: GithubWarning };

const MAX_REPOS = 5;
const README_CHARS = 6000;

type RawRepo = { name: string; description: string | null; language: string | null; pushed_at: string; fork: boolean; archived: boolean };

export async function fetchGithubRepos(
  username: string,
  opts: { fetchImpl?: typeof fetch; token?: string } = {},
): Promise<GithubResult> {
  if (!GithubUsernameSchema.safeParse(username).success) return { ok: false, warning: "github_not_found" };
  const f = opts.fetchImpl ?? fetch;
  const headers: Record<string, string> = { "User-Agent": "interview-practice-app", "X-GitHub-Api-Version": "2022-11-28" };
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  const get = (url: string, accept: string) =>
    f(url, { headers: { ...headers, Accept: accept }, signal: AbortSignal.timeout(8000) });
  const fail = (status: number): GithubResult =>
    ({ ok: false, warning: status === 404 ? "github_not_found" : status === 403 || status === 429 ? "github_rate_limited" : "github_unavailable" });

  try {
    const res = await get(`https://api.github.com/users/${username}/repos?type=owner&sort=pushed&per_page=30`, "application/vnd.github+json");
    if (!res.ok) return fail(res.status);
    const all = (await res.json()) as RawRepo[];
    const picked = all.filter((r) => !r.fork && !r.archived).slice(0, MAX_REPOS); // API already sorted by last push
    const repos = await Promise.all(picked.map(async (r): Promise<RepoInfo> => {
      let readme = "";
      try {
        const rr = await get(`https://api.github.com/repos/${username}/${r.name}/readme`, "application/vnd.github.raw+json");
        if (rr.ok) readme = (await rr.text()).slice(0, README_CHARS);
      } catch { /* a missing README is fine */ }
      return { name: r.name, description: r.description ?? "", language: r.language, pushed_at: r.pushed_at, readme };
    }));
    return { ok: true, repos };
  } catch {
    return { ok: false, warning: "github_unavailable" };
  }
}
