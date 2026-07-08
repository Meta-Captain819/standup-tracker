// Phase 6 — the one-per-day rule is a DB constraint (tested in the integration suite); the non-blank
// rule lives at the Zod boundary (CLAUDE §7) and is proven here. Pure unit tests: no DB.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { submitStandupSchema } from "./standups.schemas";

const base = { timezone: "Asia/Karachi" };

describe("submitStandupSchema (non-blank rule, CLAUDE §7)", () => {
  it("rejects the fully-blank case", () => {
    const r = submitStandupSchema.safeParse({ ...base, yesterday: "", today: "", blockers: "" });
    assert.equal(r.success, false);
  });

  it("rejects whitespace-only in every field", () => {
    const r = submitStandupSchema.safeParse({ ...base, yesterday: "  ", today: "\t", blockers: "\n" });
    assert.equal(r.success, false);
  });

  it("accepts short text with an empty blockers field", () => {
    const r = submitStandupSchema.safeParse({
      ...base,
      yesterday: "shipped the roster endpoint",
      today: "review PR",
      blockers: "",
    });
    assert.equal(r.success, true);
  });

  it("accepts a single non-empty field (only blockers)", () => {
    const r = submitStandupSchema.safeParse({
      ...base,
      yesterday: "",
      today: "",
      blockers: "stuck on the deploy",
    });
    assert.equal(r.success, true);
  });

  it("rejects an unsupported timezone", () => {
    const r = submitStandupSchema.safeParse({
      yesterday: "a",
      today: "b",
      blockers: "",
      timezone: "Mars/Phobos",
    });
    assert.equal(r.success, false);
  });
});
