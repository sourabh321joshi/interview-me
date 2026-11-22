import { extractText, getDocumentProxy } from "unpdf";

export const MAX_RESUME_BYTES = 5 * 1024 * 1024;
export const MAX_RESUME_CHARS = 20_000;

export type PdfCheck = "ok" | "too_large" | "not_pdf";

export function checkPdf(bytes: Uint8Array): PdfCheck {
  if (bytes.byteLength > MAX_RESUME_BYTES) return "too_large";
  const head = new TextDecoder().decode(bytes.slice(0, 5));
  return head === "%PDF-" ? "ok" : "not_pdf";
}

export async function extractPdfText(bytes: Uint8Array): Promise<string> {
  const pdf = await getDocumentProxy(new Uint8Array(bytes)); // copy: pdf.js may detach the buffer
  const { text } = await extractText(pdf, { mergePages: true });
  return text.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim().slice(0, MAX_RESUME_CHARS);
}
