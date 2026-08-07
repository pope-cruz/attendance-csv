import { describe, expect, it } from "vitest";

import type { EventAttendanceImport } from "@/types/event";

import { EMPTY_EVENT_DETAILS } from "./details";
import { createEventRecord } from "./record";

const lumaAttendance: EventAttendanceImport = {
  fileName: "demo-attendance.csv",
  fileSize: 128,
  result: {
    source: "luma",
    data: {
      rows: [
        {
          rowNumber: 2,
          attendee: { email: "member@example.com" },
          originalRow: { Email: "Member@example.com" },
          issues: [],
        },
      ],
      fileIssues: [],
      detectedHeaders: ["Email"],
      validRowCount: 1,
      invalidRowCount: 0,
    },
  },
};

describe("createEventRecord", () => {
  it("requires an event name", () => {
    expect(
      createEventRecord("event-1", EMPTY_EVENT_DETAILS, lumaAttendance),
    ).toEqual({
      ok: false,
      message: "Add an event name before adding this event to the session.",
    });
  });

  it("requires an attendance import", () => {
    expect(
      createEventRecord(
        "event-1",
        { ...EMPTY_EVENT_DETAILS, name: "Community Demo Night" },
        null,
      ),
    ).toEqual({
      ok: false,
      message: "Choose an attendance CSV before adding this event to the session.",
    });
  });

  it("does not accept an unrecognized CSV source", () => {
    const unknownAttendance: EventAttendanceImport = {
      fileName: "unknown.csv",
      fileSize: 20,
      result: {
        source: "unknown",
        data: {
          rows: [],
          fileIssues: [],
          detectedHeaders: [],
          validRowCount: 0,
          invalidRowCount: 0,
        },
      },
    };

    expect(
      createEventRecord(
        "event-1",
        { ...EMPTY_EVENT_DETAILS, name: "Community Demo Night" },
        unknownAttendance,
      ),
    ).toMatchObject({ ok: false });
  });

  it("preserves the parsed attendance and uses the supplied event ID", () => {
    const result = createEventRecord(
      "event-1",
      { ...EMPTY_EVENT_DETAILS, name: "  Community Demo Night  " },
      lumaAttendance,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.record.id).toBe("event-1");
    expect(result.record.details.name).toBe("Community Demo Night");
    expect(result.record.attendance).toBe(lumaAttendance);
    expect(result.record.attendance.result.data.rows).toHaveLength(1);
  });

  it("keeps same-named events distinct", () => {
    const details = {
      ...EMPTY_EVENT_DETAILS,
      name: "Weekly Community Meetup",
    };

    const first = createEventRecord("event-1", details, lumaAttendance);
    const second = createEventRecord("event-2", details, lumaAttendance);

    expect(first.ok && first.record.id).toBe("event-1");
    expect(second.ok && second.record.id).toBe("event-2");
  });
});
