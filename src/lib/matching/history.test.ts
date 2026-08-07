import { describe, expect, it } from "vitest";

import type { SessionEventRecord } from "@/types/event";

import { groupByMember } from "./history";

function lumaRecord(id: string, name: string, rows: { email: string; name?: string; checkInTime?: string; checkedIn?: string }[]): SessionEventRecord {
  return {
    id,
    details: { name, eventUrl: "", instagramUrl: "", startDate: "3/23/2026", endDate: "3/23/2026" },
    attendance: {
      fileName: `${id}.csv`,
      fileSize: 100,
      result: {
        source: "luma",
        data: {
          rows: rows.map((r, idx) => ({
            rowNumber: idx + 2,
            attendee: { email: r.email.toLowerCase(), ...(r.name && { name: r.name }), ...(r.checkInTime && { checkInTime: r.checkInTime }), ...(r.checkedIn && { checkedIn: r.checkedIn }) },
            originalRow: { Email: r.email, Name: r.name ?? "" },
            issues: [],
          })),
          fileIssues: [],
          detectedHeaders: ["Email"],
          validRowCount: rows.length,
          invalidRowCount: 0,
        },
      },
    },
  };
}

function engageRecord(id: string, name: string, rows: { email: string; name?: string; attendanceStatus: string }[]): SessionEventRecord {
  return {
    id,
    details: { name, eventUrl: "", instagramUrl: "", startDate: "3/24/2026", endDate: "3/24/2026" },
    attendance: {
      fileName: `${id}.csv`,
      fileSize: 100,
      result: {
        source: "engage",
        data: {
          metadata: {},
          rows: rows.map((r, idx) => ({
            rowNumber: idx + 7,
            attendee: { email: r.email.toLowerCase(), name: r.name, attendanceStatus: r.attendanceStatus, campusEmail: r.email.toLowerCase() },
            originalRow: { "Campus Email": r.email },
            issues: [],
          })),
          fileIssues: [],
          detectedHeaders: ["Campus Email"],
          validRowCount: rows.length,
          invalidRowCount: 0,
        },
      },
    },
  };
}

describe("groupByMember", () => {
  it("counts attended per normalized email across Luma + Engage and sorts leaderboard", () => {
    const records = [
      lumaRecord("a", "Luma Night", [
        { email: "ALEX@NYU.EDU", name: "Alex", checkInTime: "2026-07-20 18:05" },
        { email: "casey@nyu.edu", name: "Casey", checkInTime: "" }, // not attended
      ]),
      engageRecord("b", "Engage Day", [
        { email: "alex@nyu.edu", name: "Alex", attendanceStatus: "Attended" },
        { email: "alex@nyu.edu", name: "Alex", attendanceStatus: "Attended" }, // same event counted twice in attendedEvents but distinct events =1 for this record
        { email: "casey@nyu.edu", name: "Casey", attendanceStatus: "Attended" },
      ]),
    ];

    const members = groupByMember(records);
    const alex = members.find((m) => m.normalizedEmail === "alex@nyu.edu")!;
    const casey = members.find((m) => m.normalizedEmail === "casey@nyu.edu")!;

    // alex: attended in luma (1) + 2 rows in engage = 3 attended, 2 distinct events
    expect(alex.attendedCount).toBe(3);
    expect(alex.eventCount).toBe(2);
    expect(alex.displayName).toBe("Alex");
    // casey: 0 in luma (no check-in), 1 in engage = 1
    expect(casey.attendedCount).toBe(1);
    expect(casey.eventCount).toBe(2); // appears in both events (once not attended still counts toward eventCount)

    // leaderboard sorted: alex first
    expect(members[0]?.normalizedEmail).toBe("alex@nyu.edu");
  });

  it("handles Checked In Yes/No via Luma boolean and ignores non-attended rows", () => {
    const records = [
      lumaRecord("c", "Luma Boolean", [
        { email: "sam@example.com", checkedIn: "Yes" },
        { email: "sam@example.com", checkedIn: "No" },
        { email: "jo@example.com", checkedIn: "No" },
      ]),
    ];
    const members = groupByMember(records);
    const sam = members.find((m) => m.normalizedEmail === "sam@example.com")!;
    expect(sam.attendedCount).toBe(1);
    expect(sam.allEvents).toHaveLength(2);
    expect(members.find((m) => m.normalizedEmail === "jo@example.com")?.attendedCount).toBe(0);
  });

  it("returns empty for no records", () => {
    expect(groupByMember([])).toEqual([]);
  });
});
