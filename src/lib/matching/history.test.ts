import { describe, expect, it } from "vitest";

import type { SessionEventRecord } from "@/types/event";
import type { ImportIssue } from "@/types/import";

import { groupByMember } from "./history";

interface LumaRowInput {
  email: string;
  name?: string;
  checkInTime?: string;
  checkedIn?: string;
  issues?: ImportIssue[];
}

interface EngageRowInput {
  email: string;
  name?: string;
  attendanceStatus: string;
  issues?: ImportIssue[];
}

function lumaRecord(
  id: string,
  name: string,
  rows: LumaRowInput[],
): SessionEventRecord {
  const invalidRowCount = rows.filter((row) => row.issues?.length).length;

  return {
    id,
    details: {
      name,
      eventUrl: "",
      instagramUrl: "",
      startDate: "3/23/2026",
      endDate: "3/23/2026",
    },
    attendance: {
      fileName: `${id}.csv`,
      fileSize: 100,
      result: {
        source: "luma",
        data: {
          rows: rows.map((r, idx) => ({
            rowNumber: idx + 2,
            attendee: {
              email: r.email.toLowerCase(),
              ...(r.name && { name: r.name }),
              ...(r.checkInTime && { checkInTime: r.checkInTime }),
              ...(r.checkedIn && { checkedIn: r.checkedIn }),
            },
            originalRow: { Email: r.email, Name: r.name ?? "" },
            issues: r.issues ?? [],
          })),
          fileIssues: [],
          detectedHeaders: ["Email"],
          validRowCount: rows.length - invalidRowCount,
          invalidRowCount,
        },
      },
    },
  };
}

function engageRecord(
  id: string,
  name: string,
  rows: EngageRowInput[],
): SessionEventRecord {
  const invalidRowCount = rows.filter((row) => row.issues?.length).length;

  return {
    id,
    details: {
      name,
      eventUrl: "",
      instagramUrl: "",
      startDate: "3/24/2026",
      endDate: "3/24/2026",
    },
    attendance: {
      fileName: `${id}.csv`,
      fileSize: 100,
      result: {
        source: "engage",
        data: {
          metadata: {},
          rows: rows.map((r, idx) => ({
            rowNumber: idx + 7,
            attendee: {
              email: r.email.toLowerCase(),
              name: r.name,
              attendanceStatus: r.attendanceStatus,
              campusEmail: r.email.toLowerCase(),
            },
            originalRow: { "Campus Email": r.email },
            issues: r.issues ?? [],
          })),
          fileIssues: [],
          detectedHeaders: ["Campus Email"],
          validRowCount: rows.length - invalidRowCount,
          invalidRowCount,
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
        { email: "casey@nyu.edu", name: "Casey", attendanceStatus: "Attended" },
      ]),
    ];

    const members = groupByMember(records);
    const alex = members.find((m) => m.normalizedEmail === "alex@nyu.edu")!;
    const casey = members.find((m) => m.normalizedEmail === "casey@nyu.edu")!;

    expect(alex.attendedCount).toBe(2);
    expect(alex.eventCount).toBe(2);
    expect(alex.displayName).toBe("Alex");
    expect(casey.attendedCount).toBe(1);
    expect(casey.eventCount).toBe(2);

    expect(members[0]?.normalizedEmail).toBe("alex@nyu.edu");
  });

  it("handles Checked In Yes/No via Luma boolean and ignores non-attended rows", () => {
    const records = [
      lumaRecord("c-yes", "Luma Boolean Yes", [
        { email: "sam@example.com", checkedIn: "Yes" },
        { email: "jo@example.com", checkedIn: "No" },
      ]),
      lumaRecord("c-no", "Luma Boolean No", [
        { email: "sam@example.com", checkedIn: "No" },
      ]),
    ];
    const members = groupByMember(records);
    const sam = members.find((m) => m.normalizedEmail === "sam@example.com")!;
    expect(sam.attendedCount).toBe(1);
    expect(sam.allEvents).toHaveLength(2);
    expect(members.find((m) => m.normalizedEmail === "jo@example.com")?.attendedCount).toBe(0);
  });

  it("excludes rows with error-severity issues from member history", () => {
    const errorCodes: ImportIssue["code"][] = [
      "missing_email_header",
      "missing_email",
      "missing_nyu_email",
      "conflicting_nyu_emails",
      "invalid_email",
      "duplicate_email",
      "malformed_csv",
    ];
    const issue = (code: ImportIssue["code"], rowNumber: number): ImportIssue => ({
      code,
      severity: "error",
      message: `Fake ${code} issue`,
      rowNumber,
    });

    const records = [
      lumaRecord(
        "luma-errors",
        "Luma Errors",
        errorCodes.map((code, index) => ({
          email: `luma-${index}@example.com`,
          checkInTime: "2026-08-01 18:05",
          issues: [issue(code, index + 2)],
        })),
      ),
      engageRecord(
        "engage-errors",
        "Engage Errors",
        errorCodes.map((code, index) => ({
          email: `engage-${index}@nyu.edu`,
          attendanceStatus: "Attended",
          issues: [issue(code, index + 7)],
        })),
      ),
    ];

    expect(groupByMember(records)).toEqual([]);
  });

  it("does not derive history from repeated rows in one event", () => {
    const records = [
      engageRecord("valid", "Valid Event", [
        { email: "alex@nyu.edu", name: "Alex", attendanceStatus: "Attended" },
      ]),
      engageRecord("ambiguous", "Ambiguous Event", [
        { email: "alex@nyu.edu", name: "Alex", attendanceStatus: "Attended" },
        { email: "alex@nyu.edu", name: "Alexander", attendanceStatus: "Attended" },
      ]),
    ];

    const alex = groupByMember(records).find(
      (member) => member.normalizedEmail === "alex@nyu.edu",
    );

    expect(alex?.attendedCount).toBe(1);
    expect(alex?.eventCount).toBe(1);
    expect(alex?.allEvents.map((event) => event.eventId)).toEqual(["valid"]);
  });

  it("keeps warning-only rows available for derived history", () => {
    const records = [
      lumaRecord("warning", "Warning Event", [
        {
          email: "alex@example.com",
          checkedIn: "Yes",
          issues: [
            {
              code: "malformed_csv",
              severity: "warning",
              message: "Fake warning that does not invalidate identity",
              rowNumber: 2,
            },
          ],
        },
      ]),
    ];

    expect(groupByMember(records)).toMatchObject([
      {
        normalizedEmail: "alex@example.com",
        attendedCount: 1,
        eventCount: 1,
      },
    ]);
  });

  it("returns empty for no records", () => {
    expect(groupByMember([])).toEqual([]);
  });
});
