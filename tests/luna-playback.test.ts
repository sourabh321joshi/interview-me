import { afterEach, expect, it, vi } from "vitest";
import LunaQuestion from "@/app/interview/luna-question";

const hooks = vi.hoisted(() => ({ cleanup: undefined as (() => void) | undefined }));
vi.mock("react", () => ({
  useState: (initial: unknown) => [typeof initial === "function" ? initial() : initial, vi.fn()],
  useEffect: (effect: () => () => void) => { hooks.cleanup = effect(); },
}));
afterEach(() => { hooks.cleanup?.(); vi.unstubAllGlobals(); vi.useRealTimers(); });

it("waits for each sentence to finish and releases dictation after the last", async () => {
  vi.useFakeTimers();
  const player = { play: vi.fn(async () => {}), pause: vi.fn(), onended: () => {} };
  vi.stubGlobal("Audio", class { constructor() { return player; } });
  const request = vi.fn<(url: string, init: RequestInit) => Promise<Response>>().mockImplementation(async () => new Response("sample"));
  vi.stubGlobal("fetch", request);
  const speaking = vi.fn();
  LunaQuestion({ id: "fixture", seq: 1, text: "Describe your project. What did you learn?", onSpeaking: speaking });
  await vi.advanceTimersByTimeAsync(1);
  expect(request).toHaveBeenCalledTimes(1);
  expect(speaking.mock.calls).toEqual([[true]]);
  player.onended();
  await vi.advanceTimersByTimeAsync(1);
  expect(request.mock.calls.map(([, init]) => JSON.parse(String(init.body)).text)).toEqual(["Describe your project.", "What did you learn?"]);
  expect(speaking.mock.calls).toEqual([[true]]);
  player.onended();
  await vi.advanceTimersByTimeAsync(1);
  expect(speaking.mock.calls).toEqual([[true], [false]]);
});
