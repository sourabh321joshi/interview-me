import { afterEach, describe, expect, it, vi } from "vitest";
import { createGeminiProvider } from "@/lib/llm/gemini-provider";

const request = {
  model: "gemini-test-model",
  system: "Be helpful.",
  messages: [{ role: "user" as const, content: "Return JSON." }],
  json: true,
  timeoutMs: 1000,
};

afterEach(() => vi.unstubAllGlobals());

describe("Gemini provider", () => {
  it("uses the server-side key header and maps JSON output and token usage", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ text: "{\"ok\":true}" }] } }],
      usageMetadata: { promptTokenCount: 12, candidatesTokenCount: 4, cachedContentTokenCount: 2 },
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await createGeminiProvider("test-secret").generate(request);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/models/gemini-test-model:generateContent");
    expect(url).not.toContain("test-secret");
    expect(new Headers(init.headers).get("x-goog-api-key")).toBe("test-secret");
    expect(JSON.parse(String(init.body))).toMatchObject({
      systemInstruction: { parts: [{ text: "Be helpful." }] },
      generationConfig: { responseMimeType: "application/json", maxOutputTokens: 2048 },
    });
    expect(result).toEqual({ text: "{\"ok\":true}", usage: { input_tokens: 12, output_tokens: 4, cached_input_tokens: 2 } });
  });

  it("streams text deltas and final usage from SSE", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(
      'data: {"candidates":[{"content":{"parts":[{"text":"Hi"}]}}]}\n\n' +
      'data: {"candidates":[{"content":{"parts":[{"text":" there"}]}}],"usageMetadata":{"promptTokenCount":3,"candidatesTokenCount":2}}\n\n',
      { status: 200, headers: { "content-type": "text/event-stream" } },
    ));
    vi.stubGlobal("fetch", fetchMock);

    const events = [];
    for await (const event of createGeminiProvider("test-secret").stream({ ...request, json: false })) events.push(event);
    expect(fetchMock.mock.calls[0]![0]).toContain(":streamGenerateContent?alt=sse");
    expect(events).toEqual([
      { type: "delta", text: "Hi" },
      { type: "delta", text: " there" },
      { type: "done", usage: { input_tokens: 3, output_tokens: 2, cached_input_tokens: 0 } },
    ]);
  });

  it("fails before a request when no key is configured", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(createGeminiProvider(undefined).generate(request)).rejects.toMatchObject({ code: "config" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not mark upstream failures retryable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 429 })));
    await expect(createGeminiProvider("test-secret").generate(request)).rejects.toMatchObject({ retryable: false });
  });
});
