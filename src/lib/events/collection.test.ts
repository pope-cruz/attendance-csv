import { describe, expect, it } from "vitest";

import type { SessionEventRecord } from "@/types/event";

import { removeEventFromCollection } from "./collection";

function eventRecord(id: string): SessionEventRecord {
  return {
    id,
    details: {
      name: `Event ${id}`,
      eventUrl: "",
      instagramUrl: "",
      startDate: "8/1/2026",
      endDate: "8/1/2026",
    },
    attendance: {
      fileName: `${id}.csv`,
      fileSize: 128,
      result: {
        source: "luma",
        data: {
          rows: [],
          fileIssues: [],
          detectedHeaders: ["Email"],
          validRowCount: 0,
          invalidRowCount: 0,
        },
      },
    },
  };
}

describe("removeEventFromCollection", () => {
  const records = [
    eventRecord("event-1"),
    eventRecord("event-2"),
    eventRecord("event-3"),
  ];

  it("selects the newest remaining event after deleting the selected event", () => {
    expect(removeEventFromCollection(records, "event-2", "event-2")).toEqual({
      records: [records[0], records[2]],
      selectedEventId: "event-3",
    });
  });

  it("keeps the current selection when deleting another event", () => {
    expect(removeEventFromCollection(records, "event-1", "event-3")).toEqual({
      records: [records[1], records[2]],
      selectedEventId: "event-3",
    });
  });

  it("clears the selection after deleting the only event", () => {
    expect(
      removeEventFromCollection([records[0]], "event-1", "event-1"),
    ).toEqual({
      records: [],
      selectedEventId: null,
    });
  });
});
