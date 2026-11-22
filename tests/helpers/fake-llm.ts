import { createLlm, type LlmProvider, type LlmRequest } from "@/lib/llm";

export function fakeLlm(script: Array<string | Error>) {
  const calls: LlmRequest[] = [];
  const usage = { input_tokens: 1, output_tokens: 1, cached_input_tokens: 0 };
  const provider: LlmProvider = {
    name: "fake",
    async generate(req) {
      calls.push(req);
      const x = script.shift();
      if (x instanceof Error) throw x;
      return { text: x ?? "", usage };
    },
    async *stream() { yield { type: "done", usage }; },
  };
  return { llm: createLlm({ provider, sink: { async record() {} }, models: () => "m" }), calls };
}

export const SUMMARY = {
  schema_version: 1, first_name: "Riya", years_experience: 1,
  education: [{ degree: "B.Tech CSE", year: 2025 }], skills: ["JavaScript", "React"],
  projects: [{ name: "TaskFlow", description: "Kanban app", tech: ["React"], role: "Built the frontend" }], experience: [],
};
export const GH_LLM = { repos: [{ name: "taskflow", readme_gist: "A kanban app.", notable: ["Uses Socket.IO"] }] };

export function fakeFetch(routes: Record<string, { status?: number; json?: unknown; text?: string }>): typeof fetch {
  return (async (url: string | URL | Request) => {
    const u = String(url);
    const key = Object.keys(routes).find((k) => u.includes(k));
    if (!key) return new Response("{}", { status: 404 });
    const r = routes[key];
    return new Response(r.text ?? JSON.stringify(r.json ?? {}), { status: r.status ?? 200 });
  }) as typeof fetch;
}
