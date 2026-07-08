// Realtime hub — board-event fan-out is team-partitioned and role-filtered (implementation plan Phase 3,
// Golden Rule 2). Pure unit tests: a fake sink captures written SSE frames; no Express, no DB.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Role } from "../generated/prisma/client";
import {
  BOARD_EVENT,
  type Connection,
  publishBoardEvent,
  register,
  unregister,
} from "./realtime.hub";

// A capturing sink standing in for an Express Response.
function fakeSink() {
  const frames: string[] = [];
  return {
    frames,
    write(chunk: string) {
      frames.push(chunk);
    },
  };
}

// Register a connection whose captured frames are returned alongside its handle, tracked for cleanup.
function connect(
  opened: Connection[],
  ctx: { teamId: string; userId: string; role: Role },
) {
  const sink = fakeSink();
  const connection = register(sink, ctx);
  opened.push(connection);
  return { connection, frames: sink.frames };
}

function cleanup(opened: Connection[]): void {
  for (const connection of opened) {
    unregister(connection);
  }
}

const event = { userId: "u1", localStandupDate: new Date("2026-07-09T00:00:00.000Z") };

describe("publishBoardEvent (team-partitioned, role-filtered)", () => {
  it("delivers only to lead/owner-admin connections of the same team", () => {
    const opened: Connection[] = [];
    try {
      const lead = connect(opened, { teamId: "teamA", userId: "lead", role: "LEAD" });
      const admin = connect(opened, { teamId: "teamA", userId: "admin", role: "OWNER_ADMIN" });
      const member = connect(opened, { teamId: "teamA", userId: "member", role: "MEMBER" });
      const otherLead = connect(opened, { teamId: "teamB", userId: "leadB", role: "LEAD" });

      publishBoardEvent("teamA", event);

      assert.equal(lead.frames.length, 1);
      assert.equal(admin.frames.length, 1);
      assert.equal(member.frames.length, 0);
      assert.equal(otherLead.frames.length, 0);

      // The frame is a well-formed SSE board event carrying the poster's id.
      assert.match(lead.frames[0]!, new RegExp(`event: ${BOARD_EVENT}`));
      assert.match(lead.frames[0]!, /"userId":"u1"/);
    } finally {
      cleanup(opened);
    }
  });

  it("stops delivering to a connection after it is unregistered", () => {
    const opened: Connection[] = [];
    try {
      const lead = connect(opened, { teamId: "teamA", userId: "lead", role: "LEAD" });
      publishBoardEvent("teamA", event);
      assert.equal(lead.frames.length, 1);

      unregister(lead.connection);
      publishBoardEvent("teamA", event);
      assert.equal(lead.frames.length, 1);
    } finally {
      cleanup(opened);
    }
  });

  it("drops a connection whose write throws and never lets the failure escape", () => {
    const opened: Connection[] = [];
    try {
      const healthy = connect(opened, { teamId: "teamA", userId: "lead", role: "LEAD" });
      const broken = register(
        {
          write() {
            throw new Error("socket closed");
          },
        },
        { teamId: "teamA", userId: "brokenLead", role: "LEAD" },
      );
      opened.push(broken);

      assert.doesNotThrow(() => publishBoardEvent("teamA", event));
      assert.equal(healthy.frames.length, 1);

      // The broken connection was dropped on its failed write — a second publish still throws nothing.
      assert.doesNotThrow(() => publishBoardEvent("teamA", event));
      assert.equal(healthy.frames.length, 2);
    } finally {
      cleanup(opened);
    }
  });
});
