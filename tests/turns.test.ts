import { describe, expect, it } from "vitest";
import { collect, getInterviewView, MarkerStripper, prepareTurn, type TurnEvent } from "@/lib/turn-service";
import { startedInterview } from "./helpers/turn-setup";

const uid = () => crypto.randomUUID();
const text = (ev: TurnEvent[]) => ev.filter((e) => e.type === "delta").map((e) => (e as { text: string }).text).join("");
const end = (ev: TurnEvent[]) => ev.find((e) => e.type === "end") as Extract<TurnEvent, { type: "end" }>;

describe("MarkerStripper", () => {
  const run = (chunks: string[]) => { const s = new MarkerStripper(); const out = chunks.map((c) => s.push(c)).join("") + s.finish(); return { out, final: s.isFinal }; };
  it("removes the marker in one chunk or split across chunks", () => {
    expect(run(["Bye.\n[END_OF_INTERVIEW]"])).toEqual({ out: "Bye.\n", final: true });
    expect(run(["Bye. [END_", "OF_INTER", "VIEW]"])).toEqual({ out: "Bye. ", final: true });
  });
  it("keeps text that only looks like the start of the marker", () => {
    expect(run(["Use [END", " of file]"])).toEqual({ out: "Use [END of file]", final: false });
    expect(run(["Almost [END_OF"])).toEqual({ out: "Almost [END_OF", final: false });
  });
});

describe("turns", () => {
  it("opens the interview with the plan and profile in the fixed prefix", async () => {
    const { id, deps, interviews, calls } = await startedInterview([["Hi Riya, ", "tell me about TaskFlow."]]);
    const p = await prepareTurn("u1", id, { client_turn_id: uid(), type: "open" }, deps);
    expect(p).toMatchObject({ kind: "stream", start: { seq: 0, phase: "opening", remaining_seconds: 300 } });
    const ev = await collect(p);
    expect(text(ev)).toBe("Hi Riya, tell me about TaskFlow.");
    expect(end(ev)).toMatchObject({ seq: 0, is_final: false });
    expect(interviews.docs.get(id)!.turns).toHaveLength(1);
    expect(calls[0].messages).toHaveLength(1);
    expect(calls[0].system).toContain('<data label="interview_plan">');
    expect(calls[0].system).toContain('<data label="candidate_profile">');
  });

  it("saves the answer first, adds the elapsed line, and stores the reply", async () => {
    const { id, deps, interviews, clock, calls } = await startedInterview([["Hello."], ["Why Socket.IO?"]]);
    await collect(await prepareTurn("u1", id, { client_turn_id: uid(), type: "open" }, deps));
    clock.t = new Date(clock.t.getTime() + 30_000);
    const p = await prepareTurn("u1", id, { client_turn_id: uid(), type: "answer", text: "I used Socket.IO." }, deps);
    expect(interviews.docs.get(id)!.turns.map((t) => t.speaker)).toEqual(["interviewer", "candidate"]); // saved before streaming
    expect(text(await collect(p))).toBe("Why Socket.IO?");
    const msgs = calls[1].messages;
    expect(msgs.map((m) => m.role)).toEqual(["user", "assistant", "user"]);
    expect(msgs[2].content).toBe("[elapsed: 0:30 of 5:00] I used Socket.IO.");
    expect(interviews.docs.get(id)!.turn_count).toBe(3);
  });

  it("replays a finished turn without calling the model again", async () => {
    const { id, deps, calls } = await startedInterview([["Hello."], ["Why?"]]);
    await collect(await prepareTurn("u1", id, { client_turn_id: uid(), type: "open" }, deps));
    const body = { client_turn_id: uid(), type: "answer" as const, text: "Because." };
    const first = end(await collect(await prepareTurn("u1", id, body, deps)));
    const again = await prepareTurn("u1", id, body, deps);
    expect(again.kind).toBe("replay");
    expect(end(await collect(again))).toMatchObject({ seq: first.seq, text: "Why?" });
    expect(calls).toHaveLength(2);
  });

  it("regenerates after a failed stream without duplicating the answer", async () => {
    const { id, deps, interviews } = await startedInterview([["Hello."], ["Hel", new Error("boom")], ["Hello again."]]);
    await collect(await prepareTurn("u1", id, { client_turn_id: uid(), type: "open" }, deps));
    const body = { client_turn_id: uid(), type: "answer" as const, text: "My answer." };
    await expect(collect(await prepareTurn("u1", id, body, deps))).rejects.toThrow("boom");
    expect(interviews.docs.get(id)!.turn_count).toBe(2);
    const ev = await collect(await prepareTurn("u1", id, body, deps));
    expect(end(ev).seq).toBe(2);
    expect(interviews.docs.get(id)!.turns.filter((t) => t.speaker === "candidate")).toHaveLength(1);
    expect(interviews.docs.get(id)!.turn_count).toBe(3);
  });

  it("lets only one of two simultaneous answers through", async () => {
    const { id, deps } = await startedInterview([["Hello."], ["A."], ["B."]]);
    await collect(await prepareTurn("u1", id, { client_turn_id: uid(), type: "open" }, deps));
    const mk = () => prepareTurn("u1", id, { client_turn_id: uid(), type: "answer", text: "x" }, deps);
    const r = await Promise.allSettled([mk(), mk()]);
    expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect((r.find((x) => x.status === "rejected") as PromiseRejectedResult).reason).toMatchObject({ code: "interview_not_active" });
  });

  it("asks the model to wrap up in the last 30 seconds", async () => {
    const { id, deps, interviews, clock, calls } = await startedInterview([["Hello."], ["Thanks."]]);
    await collect(await prepareTurn("u1", id, { client_turn_id: uid(), type: "open" }, deps));
    clock.t = new Date(clock.t.getTime() + 280_000);
    const p = await prepareTurn("u1", id, { client_turn_id: uid(), type: "answer", text: "ok" }, deps);
    expect(p).toMatchObject({ kind: "stream", start: { phase: "wrapup", remaining_seconds: 20 } });
    await collect(p);
    expect(calls[1].messages.at(-1)!.content).toContain("[server note:");
    expect(interviews.docs.get(id)!.status).toBe("wrapping_up");
  });

  it("finishes when the model prints the marker, and refuses further turns", async () => {
    const { id, deps, interviews, clock } = await startedInterview([["Hello."], ["Thanks, goodbye. [END_", "OF_INTERVIEW]"]]);
    await collect(await prepareTurn("u1", id, { client_turn_id: uid(), type: "open" }, deps));
    clock.t = new Date(clock.t.getTime() + 285_000);
    const body = { client_turn_id: uid(), type: "answer" as const, text: "bye" };
    const ev = await collect(await prepareTurn("u1", id, body, deps));
    expect(end(ev)).toMatchObject({ text: "Thanks, goodbye.", is_final: true });
    expect(interviews.docs.get(id)).toMatchObject({ status: "completed", end_reason: "model_finished" });
    await expect(prepareTurn("u1", id, { client_turn_id: uid(), type: "answer", text: "more" }, deps)).rejects.toMatchObject({ code: "interview_not_active" });
    expect(end(await collect(await prepareTurn("u1", id, body, deps))).is_final).toBe(true); // a retry still gets the final turn
  });

  it("rejects turns after the time limit plus grace, and ends the interview", async () => {
    const { id, deps, interviews, clock, endsAt } = await startedInterview([["Hello."], ["Late."]]);
    await collect(await prepareTurn("u1", id, { client_turn_id: uid(), type: "open" }, deps));
    clock.t = new Date(endsAt + 10_000); // inside the 15 s grace period
    await collect(await prepareTurn("u1", id, { client_turn_id: uid(), type: "answer", text: "last" }, deps));
    clock.t = new Date(endsAt + 16_000);
    await expect(prepareTurn("u1", id, { client_turn_id: uid(), type: "answer", text: "too late" }, deps)).rejects.toMatchObject({ code: "interview_expired" });
    expect(interviews.docs.get(id)).toMatchObject({ status: "completed", end_reason: "timeout" });
  });

  it("enforces the 40-turn cap", async () => {
    const { id, deps, interviews } = await startedInterview([["Hello."]]);
    await collect(await prepareTurn("u1", id, { client_turn_id: uid(), type: "open" }, deps));
    interviews.docs.get(id)!.turn_count = 40;
    await expect(prepareTurn("u1", id, { client_turn_id: uid(), type: "answer", text: "x" }, deps)).rejects.toMatchObject({ code: "interview_expired" });
  });

  it("validates requests and ownership", async () => {
    const { id, deps } = await startedInterview([]);
    const bad = (b: object) => expect(prepareTurn("u1", id, b, deps)).rejects.toMatchObject({ code: "validation_failed" });
    await bad({ type: "answer", text: "x" });
    await bad({ client_turn_id: uid(), type: "answer" });
    await bad({ client_turn_id: uid(), type: "open", text: "hi" });
    await bad({ client_turn_id: uid(), type: "answer", text: "x".repeat(2001) });
    await bad({ client_turn_id: uid(), type: "answer", text: "no opening yet" });
    await expect(prepareTurn("u2", id, { client_turn_id: uid(), type: "open" }, deps)).rejects.toMatchObject({ code: "not_found" });
  });

  it("records silence as a system turn", async () => {
    const { id, deps, interviews, calls } = await startedInterview([["Hello."], ["Take your time."]]);
    await collect(await prepareTurn("u1", id, { client_turn_id: uid(), type: "open" }, deps));
    await collect(await prepareTurn("u1", id, { client_turn_id: uid(), type: "silence" }, deps));
    expect(interviews.docs.get(id)!.turns[1].kind).toBe("system");
    expect(calls[1].messages.at(-1)!.content).toContain("silent");
  });
});

describe("interview view", () => {
  it("returns the transcript for refreshes, hides ownership violations, and heals expired interviews", async () => {
    const { id, deps, clock, endsAt, interviews } = await startedInterview([["Hello."], ["Ok."]]);
    await collect(await prepareTurn("u1", id, { client_turn_id: uid(), type: "open" }, deps));
    const cid = uid();
    await collect(await prepareTurn("u1", id, { client_turn_id: cid, type: "answer", text: "hi" }, deps));
    const v = await getInterviewView("u1", id, deps);
    expect(v.turns.map((t) => t.speaker)).toEqual(["interviewer", "candidate", "interviewer"]);
    expect(v.turns[1].client_turn_id).toBe(cid);
    expect(v.turns[0].client_turn_id).toBeNull();
    await expect(getInterviewView("u2", id, deps)).rejects.toMatchObject({ code: "not_found" });
    clock.t = new Date(endsAt + 60_000);
    expect((await getInterviewView("u1", id, deps)).status).toBe("completed");
    expect(interviews.docs.get(id)!.end_reason).toBe("timeout");
  });
});
