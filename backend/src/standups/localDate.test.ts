// Phase 6 — timezone correctness for the writer-local-day service (CLAUDE §6). Pure unit tests: no DB.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { currentLocalDate, deriveLocalStandupDate } from "./localDate";

const iso = (d: Date): string => d.toISOString().slice(0, 10);

describe("deriveLocalStandupDate", () => {
  it("files one instant under each writer's own local day (Karachi Tue vs SF Mon)", () => {
    const instant = new Date("2026-07-07T22:30:00Z");
    assert.equal(iso(deriveLocalStandupDate(instant, "Asia/Karachi")), "2026-07-08");
    assert.equal(iso(deriveLocalStandupDate(instant, "America/Los_Angeles")), "2026-07-07");
  });

  it("resolves DST-boundary instants correctly for Berlin and San Francisco", () => {
    // Europe/Berlin springs forward 2026-03-29; 00:30Z is 01:30 local, still Mar 29.
    assert.equal(
      iso(deriveLocalStandupDate(new Date("2026-03-29T00:30:00Z"), "Europe/Berlin")),
      "2026-03-29",
    );
    // America/Los_Angeles falls back 2026-11-01; 08:30Z is 01:30 local, still Nov 1.
    assert.equal(
      iso(deriveLocalStandupDate(new Date("2026-11-01T08:30:00Z"), "America/Los_Angeles")),
      "2026-11-01",
    );
  });

  it("is stable for Karachi, which does not observe DST", () => {
    assert.equal(
      iso(deriveLocalStandupDate(new Date("2026-01-15T19:00:00Z"), "Asia/Karachi")),
      "2026-01-16",
    );
    assert.equal(
      iso(deriveLocalStandupDate(new Date("2026-07-15T19:00:00Z"), "Asia/Karachi")),
      "2026-07-16",
    );
  });

  it("returns the calendar date pinned to UTC midnight (@db.Date-compatible)", () => {
    const d = deriveLocalStandupDate(new Date("2026-07-07T22:30:00Z"), "Asia/Karachi");
    assert.equal(d.toISOString(), "2026-07-08T00:00:00.000Z");
  });
});

describe("currentLocalDate", () => {
  it("returns a calendar date pinned to UTC midnight", () => {
    const d = currentLocalDate("Europe/Berlin");
    assert.equal(d.getUTCHours(), 0);
    assert.equal(d.getUTCMinutes(), 0);
    assert.equal(d.getUTCSeconds(), 0);
    assert.equal(d.getUTCMilliseconds(), 0);
  });
});
