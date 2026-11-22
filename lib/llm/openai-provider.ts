import OpenAI from "openai";
import { LlmError, type LlmProvider, type LlmRequest, type StreamEvent, type Usage } from "./types";

type RawUsage = { input_tokens?: number; output_tokens?: number; input_tokens_details?: { cached_tokens?: number } } | null | undefined;

function mapUsage(u: RawUsage): Usage {
  return {
    input_tokens: u?.input_tokens ?? 0,
    output_tokens: u?.output_tokens ?? 0,
    cached_input_tokens: u?.input_tokens_details?.cached_tokens ?? 0,
  };
}

function toLlmError(err: unknown): LlmError {
  if (err instanceof LlmError) return err;
  const status = (err as { status?: number }).status;
  const network = err instanceof OpenAI.APIConnectionError;
  const retryable = network || status === 408 || status === 409 || status === 429 || (status !== undefined && status >= 500);
  const message = status ? `OpenAI request failed (${status})` : "OpenAI request failed";
  return new LlmError("upstream_unavailable", message, retryable);
}

export function createOpenAiProvider(client?: OpenAI): LlmProvider {
  const get = () => (client ??= new OpenAI({ apiKey: process.env.OPENAI_API_KEY, maxRetries: 0 }));
  const params = (req: LlmRequest) => ({
    model: req.model,
    instructions: req.system,
    // JSON mode checks the input messages for "JSON", even when instructions already mention it.
    input: req.json
      ? [...req.messages, { role: "user" as const, content: "Return the result as JSON." }]
      : req.messages,
    store: false, // do not keep our requests on the provider side
    ...(req.json ? { text: { format: { type: "json_object" as const } } } : {}),
  });

  return {
    name: "openai",
    async generate(req) {
      try {
        const res = await get().responses.create(params(req), { timeout: req.timeoutMs });
        return { text: res.output_text, usage: mapUsage(res.usage) };
      } catch (err) {
        throw toLlmError(err);
      }
    },
    async *stream(req): AsyncGenerator<StreamEvent> {
      try {
        const events = await get().responses.create({ ...params(req), stream: true }, { timeout: req.timeoutMs });
        let usage = mapUsage(null);
        for await (const ev of events) {
          if (ev.type === "response.output_text.delta") yield { type: "delta", text: ev.delta };
          else if (ev.type === "response.completed") usage = mapUsage(ev.response.usage);
          else if (ev.type === "response.failed") throw new LlmError("upstream_unavailable", "OpenAI response failed", false);
        }
        yield { type: "done", usage };
      } catch (err) {
        throw toLlmError(err);
      }
    },
  };
}
