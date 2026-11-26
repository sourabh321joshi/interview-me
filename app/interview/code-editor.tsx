"use client";

import { useEffect, useRef, useState } from "react";

export default function CodeEditor({ value, onChange, disabled }: {
  value: string;
  onChange: (code: string) => void;
  disabled: boolean;
}) {
  const host = useRef<HTMLDivElement>(null);
  const instance = useRef<import("monaco-editor").editor.IStandaloneCodeEditor | null>(null);
  const initial = useRef(value);
  const readOnly = useRef(disabled);
  const [status, setStatus] = useState<"loading" | "ready" | "unavailable">("loading");

  useEffect(() => {
    let closed = false;
    let dispose: (() => void) | undefined;
    async function mount() {
      const monaco = await import("monaco-editor/esm/vs/editor/editor.api.js");
      await import("monaco-editor/esm/vs/basic-languages/javascript/javascript.contribution.js");
      if (closed || !host.current) return;
      const model = monaco.editor.createModel(initial.current, "javascript");
      const editor = monaco.editor.create(host.current, {
        model, readOnly: readOnly.current, theme: "vs-dark", automaticLayout: true, ariaLabel: "JavaScript source code",
        minimap: { enabled: false }, scrollBeyondLastLine: false, tabSize: 2, fontSize: 14,
      });
      instance.current = editor;
      setStatus("ready");
      const subscription = model.onDidChangeContent(() => onChange(model.getValue()));
      dispose = () => { subscription.dispose(); editor.dispose(); model.dispose(); };
    }
    void mount().catch(() => { if (!closed) setStatus("unavailable"); });
    return () => {
      closed = true;
      instance.current = null;
      dispose?.();
    };
  }, [onChange]);

  useEffect(() => {
    readOnly.current = disabled;
    instance.current?.updateOptions({ readOnly: disabled });
  }, [disabled]);

  if (status === "unavailable") return <textarea className="field h-52 font-mono" aria-label="JavaScript source code"
    value={value} onChange={event => onChange(event.target.value)} disabled={disabled} />;
  return <>
    {status === "loading" && <p role="status" className="text-sm text-muted">Loading JavaScript editor...</p>}
    <div className="h-52 overflow-hidden rounded-lg border border-line sm:h-64" ref={host} />
  </>;
}
