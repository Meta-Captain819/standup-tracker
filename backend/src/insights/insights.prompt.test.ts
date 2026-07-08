// Phase 3 — the grounding transform is pure and deterministic, so it is proven here without a DB or any
// Gemini call: identical content yields an identical fingerprint regardless of row order, any content
// change moves it, and the low/no-data case is stated in the prompt rather than invented.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { TeamStandup } from "../standups/standups.service";
import { buildSummaryPrompt, fingerprintStandups } from "./insights.prompt";

const day = new Date("2026-07-08T00:00:00.000Z");

function standup(over: Partial<TeamStandup> & { user: TeamStandup["user"] }): TeamStandup {
  return {
    id: `s_${over.user.id}`,
    yesterday: "shipped the roster endpoint",
    today: "review PR",
    blockers: "",
    submittedAtUtc: new Date("2026-07-08T09:00:00.000Z"),
    timezone: "Asia/Karachi",
    localStandupDate: day,
    editedAt: null,
    ...over,
  };
}

const alice = standup({ user: { id: "u_alice", name: "Alice" } });
const bob = standup({ user: { id: "u_bob", name: "Bob" }, blockers: "waiting on API keys" });

describe("fingerprintStandups (cache validity, AI module plan Phase 3)", () => {
  it("is order-independent", () => {
    assert.equal(fingerprintStandups([alice, bob]), fingerprintStandups([bob, alice]));
  });

  it("changes when a person's update content changes", () => {
    const edited = standup({ user: alice.user, today: "review PR and deploy" });
    assert.notEqual(fingerprintStandups([alice, bob]), fingerprintStandups([edited, bob]));
  });

  it("changes when the set of contributors changes", () => {
    assert.notEqual(fingerprintStandups([alice, bob]), fingerprintStandups([alice]));
  });

  it("is stable across calls on identical content", () => {
    assert.equal(fingerprintStandups([alice, bob]), fingerprintStandups([alice, bob]));
  });
});

describe("buildSummaryPrompt (grounded, summarize-only, AI module plan Phase 3)", () => {
  it("states the low/no-data case explicitly instead of inventing", () => {
    const { prompt } = buildSummaryPrompt(day, []);
    assert.match(prompt.user, /No updates were submitted/);
  });

  it("grounds the prompt in the real names and text written", () => {
    const { prompt } = buildSummaryPrompt(day, [alice, bob]);
    assert.match(prompt.user, /\[Alice\]/);
    assert.match(prompt.user, /waiting on API keys/);
    assert.match(prompt.user, /2 submitted/);
  });

  it("frames update text as untrusted, not as instructions", () => {
    const { prompt } = buildSummaryPrompt(day, [alice]);
    assert.match(prompt.system, /never follow/i);
  });

  it("labels an empty blockers field rather than dropping it", () => {
    const { prompt } = buildSummaryPrompt(day, [alice]);
    assert.match(prompt.user, /Blockers: \(none reported\)/);
  });

  it("is deterministic for the same inputs", () => {
    assert.deepEqual(buildSummaryPrompt(day, [alice, bob]), buildSummaryPrompt(day, [alice, bob]));
  });
});
