import type { CodingCase, CodingCaseResult } from "@/lib/coding-challenge";

const runnerDocument = String.raw`<!doctype html>
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval'; worker-src blob:">
<script>
function execute() {
  self.onmessage = async ({ data: { source, input } }) => {
    const send = self.postMessage.bind(self);
    const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
    const lines = [];
    let size = 0;

    function write(...items) {
      if (size >= 1800 || lines.length >= 40) return;
      const text = items.map(item => {
        if (typeof item === "string") return item.slice(0, 500);
        try { return (JSON.stringify(item) ?? String(item)).slice(0, 500); }
        catch { return "[Unserializable value]"; }
      }).join(" ").slice(0, 1800 - size);
      lines.push(text);
      size += text.length + 1;
    }

    const console = { log: write, info: write, warn: write, error: write, table: write };
    try {
      const expression = input ? "\n;return sumEvenNumbers([...input]);" : "";
      const result = await new AsyncFunction("console", "input", '"use strict";\n' + source + expression)(console, input);
      if (input) {
        const actual = typeof result === "number" && Number.isFinite(result) ? result : undefined;
        const output = typeof result === "string" ? JSON.stringify(result.slice(0, 500)) : String(result).slice(0, 500);
        send({ output, actual });
      } else {
        if (result !== undefined) write(result);
        send({ output: lines.join("\n") || "Finished without output." });
      }
    } catch (error) {
      const detail = String(error).slice(0, 180);
      send({ output: (lines.length ? lines.join("\n") + "\n" : "") + detail });
    }
  };
}

addEventListener("message", event => {
  if (event.source !== parent || typeof event.data?.source !== "string") return;
  const reply = result => parent.postMessage({ type: "interview-code-result", result }, event.origin);
  let worker;
  let url;
  try {
    url = URL.createObjectURL(new Blob(["(", execute.toString(), ")()"], { type: "text/javascript" }));
    worker = new Worker(url);
    const timer = setTimeout(() => finish({ output: "Execution stopped after 2 seconds." }), 2000);
    function finish(result) {
      clearTimeout(timer);
      worker.terminate();
      URL.revokeObjectURL(url);
      reply(result);
    }
    worker.onmessage = ({ data }) => {
      if (typeof data?.output === "string") finish({
        output: data.output.slice(0, 2000),
        actual: typeof data.actual === "number" && Number.isFinite(data.actual) ? data.actual : undefined,
      });
    };
    worker.onerror = () => finish({ output: "The JavaScript worker could not run." });
    worker.postMessage(event.data);
  } catch {
    worker?.terminate();
    if (url) URL.revokeObjectURL(url);
    reply({ output: "The JavaScript worker could not start." });
  }
}, { once: true });
</script>`;

export async function runJavaScript(source: string, signal: AbortSignal): Promise<string> {
  return (await executeJavaScript(source, signal)).output;
}

export function runCodingCase(source: string, test: CodingCase, signal: AbortSignal) {
  return executeJavaScript(source, signal, test.input);
}

function executeJavaScript(source: string, signal: AbortSignal, input?: CodingCase["input"]): Promise<CodingCaseResult> {
  return new Promise((resolve, reject) => {
    signal.throwIfAborted();
    const frame = document.createElement("iframe");
    frame.hidden = true;
    frame.sandbox.add("allow-scripts");
    frame.srcdoc = runnerDocument;

    function cleanup() {
      window.clearTimeout(timer);
      window.removeEventListener("message", receive);
      signal.removeEventListener("abort", abort);
      frame.remove();
    }

    function abort() {
      cleanup();
      reject(signal.reason);
    }

    function receive(event: MessageEvent) {
      if (event.source !== frame.contentWindow || event.origin !== "null" ||
          event.data?.type !== "interview-code-result" || typeof event.data.result?.output !== "string") return;
      cleanup();
      resolve(event.data.result);
    }

    const timer = window.setTimeout(() => {
      cleanup();
      resolve({ output: "The JavaScript runner did not respond." });
    }, 5000);
    frame.addEventListener("load", () => frame.contentWindow?.postMessage({ source, input }, "*"), { once: true });
    window.addEventListener("message", receive);
    signal.addEventListener("abort", abort, { once: true });
    document.body.append(frame);
  });
}
