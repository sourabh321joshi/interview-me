export const durationSeconds = 60;
const cues = [
  [0, "Tell me about a project you built."],
  [5, "I built a dashboard using React and TypeScript."],
  [16, "How did you handle slow API responses?"],
  [30, "Pehle maine network requests check kiye, phir caching add ki."],
  [45, "How did you verify the change worked?"],
] as const;

export function previewFrame(start: number, now: number) {
  const elapsed = Math.max(0, Math.floor((now - start) / 1000));
  return {
    remaining: Math.max(0, durationSeconds - elapsed),
    caption: cues.filter(([second]) => second <= elapsed).at(-1)![1],
  };
}
