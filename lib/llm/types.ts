export type Role = "profile" | "plan" | "turn" | "report";
export type Usage = { input_tokens: number; output_tokens: number; cached_input_tokens: number };
export type Message = { role: "user" | "assistant"; content: string };
export type LlmRequest = {
  model: string;
  system: string;
  messages: Message[];
  json?: boolean;
  timeoutMs: number;
};
export type StreamEvent = { type: "delta"; text: string } | { type: "done"; usage: Usage };

export interface LlmProvider {
  name: string;
  generate(req: LlmRequest): Promise<{ text: string; usage: Usage }>;
  stream(req: LlmRequest): AsyncGenerator<StreamEvent>;
}

export class LlmError extends Error {
  constructor(
    public code: "upstream_unavailable" | "invalid_output" | "config",
    message: string,
    public retryable = false,
  ) {
    super(message);
    this.name = "LlmError";
  }
}

export type CallContext = { user_id?: string; interview_id?: string };

export type UsageEvent = CallContext & {
  provider: string;
  role: Role;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cached_input_tokens: number;
  latency_ms: number;
  est_cost_usd: number;
};

export interface UsageSink {
  record(event: UsageEvent): Promise<void>;
}
