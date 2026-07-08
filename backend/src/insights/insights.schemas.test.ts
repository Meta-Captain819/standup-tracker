// Phase 1 — the insights inputs are validated at the Zod boundary (CLAUDE §7). The `standupDate` field
// must accept a plain calendar date and normalize it to UTC midnight (matching how localStandupDate is
// stored) and reject anything that is not a real `YYYY-MM-DD` date. Pure unit tests: no DB.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  generatedSummarySchema,
  refreshFlagSchema,
  summaryDateInputSchema,
} from "./insights.schemas";

describe("summaryDateInputSchema (AI module plan Phase 1)", () => {
  it("normalizes a calendar date to UTC midnight", () => {
    const r = summaryDateInputSchema.safeParse({ standupDate: "2026-07-08" });
    assert.equal(r.success, true);
    assert.equal(r.data!.standupDate.toISOString(), "2026-07-08T00:00:00.000Z");
  });

  it("rejects a non-date string", () => {
    assert.equal(summaryDateInputSchema.safeParse({ standupDate: "yesterday" }).success, false);
  });

  it("rejects a datetime rather than a bare calendar date", () => {
    assert.equal(
      summaryDateInputSchema.safeParse({ standupDate: "2026-07-08T09:00:00Z" }).success,
      false,
    );
  });
});

describe("refreshFlagSchema (AI module plan Phase 1)", () => {
  it("defaults to false when omitted", () => {
    const r = refreshFlagSchema.safeParse(undefined);
    assert.equal(r.success, true);
    assert.equal(r.data, false);
  });
});

describe("generatedSummarySchema (model output guard, AI module plan Phase 4)", () => {
  it("rejects an empty or whitespace-only model response", () => {
    assert.equal(generatedSummarySchema.safeParse("").success, false);
    assert.equal(generatedSummarySchema.safeParse("   \n\t").success, false);
  });

  it("rejects output that exceeds the defensive length bound", () => {
    assert.equal(generatedSummarySchema.safeParse("x".repeat(8001)).success, false);
  });

  it("accepts and trims a valid summary", () => {
    const r = generatedSummarySchema.safeParse("  Alice shipped the roster endpoint.  ");
    assert.equal(r.success, true);
    assert.equal(r.data, "Alice shipped the roster endpoint.");
  });
});
