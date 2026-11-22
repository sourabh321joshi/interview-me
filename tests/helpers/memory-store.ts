import type { ProfileDoc, ProfilesStore } from "@/lib/profiles-store";

export function memoryStore(): ProfilesStore & { docs: Map<string, ProfileDoc> } {
  const docs = new Map<string, ProfileDoc>();
  let n = 0;
  const own = (u: string, id: string) => { const d = docs.get(id); return d && d.user_id === u ? d : null; };
  return {
    docs,
    async insert(doc) {
      const id = `p${++n}`;
      docs.set(id, { id, ...doc, status: "processing", summary: null, github_summary: null, error_code: null, created_at: new Date(), updated_at: new Date() });
      return id;
    },
    async findOwned(u, id) { return own(u, id); },
    async markReady(u, id, data) { const d = own(u, id); if (d) Object.assign(d, { status: "ready", ...data }); },
    async markFailed(u, id, code) { const d = own(u, id); if (d) Object.assign(d, { status: "failed", error_code: code }); },
    async patchSummary(u, id, patch) { const d = own(u, id); if (!d || d.status !== "ready") return null; d.summary = { ...d.summary!, ...patch }; return d; },
  };
}
