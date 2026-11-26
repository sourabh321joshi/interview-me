const runnerDocument = String.raw`<!doctype html>
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval'; worker-src blob:">
<script>
function execute() {
  self.onmessage = async ({ data: source }) => {
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
      const result = await new AsyncFunction("console", '"use strict";\n' + source)(console);
      if (result !== undefined) write(result);
      send(lines.join("\n") || "Finished without output.");
    } catch (error) {
      const detail = String(error).slice(0, 180);
      send((lines.length ? lines.join("\n") + "\n" : "") + detail);
    }
  };
}

addEventListener("message", event => {
  if (event.source !== parent || typeof event.data !== "string") return;
  const reply = output => parent.postMessage({ type: "interview-code-result", output }, event.origin);
  let worker;
  let url;
  try {
    url = URL.createObjectURL(new Blob(["(", execute.toString(), ")()"], { type: "text/javascript" }));
    worker = new Worker(url);
    const timer = setTimeout(() => finish("Execution stopped after 2 seconds."), 2000);
    function finish(output) {
      clearTimeout(timer);
      worker.terminate();
      URL.revokeObjectURL(url);
      reply(output);
    }
    worker.onmessage = ({ data }) => {
      if (typeof data === "string") finish(data.slice(0, 2000));
    };
    worker.onerror = () => finish("The JavaScript worker could not run.");
    worker.postMessage(event.data);
  } catch {
    worker?.terminate();
    if (url) URL.revokeObjectURL(url);
    reply("The JavaScript worker could not start.");
  }
}, { once: true });
</script>`;

export function runJavaScript(source: string, signal: AbortSignal): Promise<string> {
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
          event.data?.type !== "interview-code-result" || typeof event.data.output !== "string") return;
      cleanup();
      resolve(event.data.output.slice(0, 2000));
    }

    const timer = window.setTimeout(() => {
      cleanup();
      resolve("The JavaScript runner did not respond.");
    }, 5000);
    frame.addEventListener("load", () => frame.contentWindow?.postMessage(source, "*"), { once: true });
    window.addEventListener("message", receive);
    signal.addEventListener("abort", abort, { once: true });
    document.body.append(frame);
  });
}
