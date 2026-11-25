import AuraPreview from "./aura-preview";
import LiveCaptions from "./live-captions";
import Link from "next/link";
import VoiceTest from "./voice-test";

export default function Page() {
  return <main className="mx-auto max-w-xl space-y-6 px-5 py-12">
    <Link className="text-muted underline" href="/interview">Back to interview</Link>
    <h1 className="text-3xl font-semibold">Voice test</h1>
    <p className="text-muted">Choose live transcription or the local microphone and voice preview.</p>
    <LiveCaptions />
    <AuraPreview />
    <VoiceTest />
  </main>;
}
