import { expect, it } from "vitest";
import { previewFrame } from "../app/voice-test/preview";

it("advances sample captions and caps a delayed timer at one minute", () => {
  expect(previewFrame(1000, 1000).remaining).toBe(60);
  expect(previewFrame(1000, 30999).caption).toContain("slow API");
  expect(previewFrame(1000, 31000).caption).toContain("Pehle");
  expect(previewFrame(1000, 60999).remaining).toBe(1);
  expect(previewFrame(1000, 61000).remaining).toBe(0);
  expect(previewFrame(1000, 99000).remaining).toBe(0);
});
