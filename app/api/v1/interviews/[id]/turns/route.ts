import { consentRequired } from "@/lib/consent";
import { apiError } from "@/lib/api-error";
import { getCurrentUserId } from "@/lib/auth";
import { rateLimited } from "@/lib/route-guard";
import { interviewDeps } from "@/lib/deps";
import { getLlm } from "@/lib/llm";
import { handleError } from "@/lib/route-errors";
import { questionSegments, voiceProof } from "@/lib/streamed-voice";
import { prepareTurn, type Prepared } from "@/lib/turn-service";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getCurrentUserId(request.headers);
  if (!userId) return apiError("unauthenticated", "Sign in to continue.");
  const limited = await rateLimited(userId, "general");
  if (limited) return limited;
  const consent = await consentRequired(userId);
  if (consent) return consent;
  const body = await request.json().catch(() => null);
  if (!body) return apiError("validation_failed", "Send a JSON body.");
  const deps = interviewDeps();
  const { id } = await params;
  let prepared: Prepared;
  try {
    prepared = await prepareTurn(userId, id, body, { interviews: deps.interviews, profiles: deps.profiles, llm: getLlm() });
  } catch (err) {
    return handleError(err);
  }

  const enc = new TextEncoder();
  const frame = (event: string, data: unknown) => enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        if (prepared.kind === "replay") {
          controller.enqueue(frame("turn.end", prepared.end));
        } else {
          controller.enqueue(frame("turn.start", prepared.start));
          let tail = "";
          for await (const ev of prepared.run()) {
            if (ev.type === "delta") controller.enqueue(frame("text.delta", { text: ev.text }));
            if (prepared.voice) {
              const seq = prepared.start.seq;
              const result = questionSegments(tail + (ev.type === "delta" ? ev.text : ""), ev.type === "end");
              tail = result.tail;
              for (const text of result.clips) {
                const proof = voiceProof(userId, id, seq, text);
                if (proof) controller.enqueue(frame("voice.clip", { seq, text, proof }));
              }
            }
            if (ev.type === "end") controller.enqueue(frame("turn.end", { seq: ev.seq, text: ev.text, is_final: ev.is_final, remaining_seconds: ev.remaining_seconds }));
          }
        }
      } catch {
        console.warn("turn stream failed"); // never log prompt or transcript content
        controller.enqueue(frame("error", { code: "upstream_unavailable", message: "Please try again.", retryable: true }));
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no" } });
}
