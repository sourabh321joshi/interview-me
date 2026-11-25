import { LlmError, type LlmProvider, type LlmRequest, type StreamEvent, type Usage } from "./types";

type GeminiUsage = {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  cachedContentTokenCount?: number;
};
type GeminiResponse = {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  usageMetadata?: GeminiUsage;
};

function mapUsage(u: GeminiUsage | undefined): Usage {
  return {
    input_tokens: u?.promptTokenCount ?? 0,
    output_tokens: u?.candidatesTokenCount ?? 0,
    cached_input_tokens: u?.cachedContentTokenCount ?? 0,
  };
}

function toLlmError(status?: number): LlmError {
  // Keep this provider single-attempt: a smoke test should never silently spend twice.
  return new LlmError("upstream_unavailable", `Gemini request failed${status ? ` (${status})` : ""}`, false, status);
}

function body(req: LlmRequest) {
  return {
    systemInstruction: { parts: [{ text: req.system }] },
    contents: req.messages.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] })),
    generationConfig: {
      maxOutputTokens: 2048,
      ...(req.json ? { responseMimeType: "application/json" } : {}),
    },
  };
}

function textFrom(data: GeminiResponse) {
  return data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
}

export function createGeminiProvider(apiKey = process.env.GEMINI_API_KEY): LlmProvider {
  const endpoint = (model: string, stream = false) =>
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:${stream ? "streamGenerateContent?alt=sse" : "generateContent"}`;

  return {
    name: "gemini",
    async generate(req) {
      if (!apiKey) throw new LlmError("config", "GEMINI_API_KEY is not configured");
      let response: Response;
      try {
        response = await fetch(endpoint(req.model), {
          method: "POST",
          headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
          body: JSON.stringify(body(req)),
          signal: AbortSignal.timeout(req.timeoutMs),
        });
      } catch {
        throw toLlmError();
      }
      if (!response.ok) throw toLlmError(response.status);
      const data = await response.json() as GeminiResponse;
      return { text: textFrom(data), usage: mapUsage(data.usageMetadata) };
    },
    async *stream(req): AsyncGenerator<StreamEvent> {
      if (!apiKey) throw new LlmError("config", "GEMINI_API_KEY is not configured");
      let response: Response;
      try {
        response = await fetch(endpoint(req.model, true), {
          method: "POST",
          headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
          body: JSON.stringify(body(req)),
          signal: AbortSignal.timeout(req.timeoutMs),
        });
      } catch {
        throw toLlmError();
      }
      if (!response.ok || !response.body) throw toLlmError(response.status);

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let usage: Usage = mapUsage(undefined);
      try {
        while (true) {
          const { done, value } = await reader.read();
          buffer += decoder.decode(value, { stream: !done });
          const events = buffer.split(/\r?\n\r?\n/);
          buffer = events.pop() ?? "";
          for (const event of events) {
            const data = event.split(/\r?\n/).filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trim()).join("\n");
            if (!data || data === "[DONE]") continue;
            const chunk = JSON.parse(data) as GeminiResponse;
            const delta = textFrom(chunk);
            if (delta) yield { type: "delta", text: delta };
            if (chunk.usageMetadata) usage = mapUsage(chunk.usageMetadata);
          }
          if (done) break;
        }
        yield { type: "done", usage };
      } catch {
        throw toLlmError();
      } finally {
        reader.releaseLock();
      }
    },
  };
}
