import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { checkPdf, extractPdfText, MAX_RESUME_BYTES } from "@/lib/pdf";

const pdf = new Uint8Array(fs.readFileSync("tests/fixtures/resume.pdf"));

describe("pdf", () => {
  it("validates type and size", () => {
    expect(checkPdf(pdf)).toBe("ok");
    expect(checkPdf(new TextEncoder().encode("hello world"))).toBe("not_pdf");
    expect(checkPdf(new Uint8Array(MAX_RESUME_BYTES + 1))).toBe("too_large");
  });
  it("extracts text", async () => {
    const text = await extractPdfText(pdf);
    expect(text).toContain("TaskFlow");
    expect(text).toContain("React");
  });
});
