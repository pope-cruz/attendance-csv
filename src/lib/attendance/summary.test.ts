import { describe, expect, it } from "vitest";

import type { AttendanceImportResult } from "@/types/import";

import { summarizeAttendance, summarizeSessionEvents } from "./summary";

describe("summarizeAttendance", () => {
  it("keeps attendance and identity resolution as separate counts", () => {
    const result: AttendanceImportResult = {
      source: "engage",
      data: {
        metadata: {},
        rows: [
          {
            rowNumber: 2,
            attendee: {
              email: "alex@nyu.edu",
              attendanceStatus: "Attended",
            },
            originalRow: {
              "Campus Email": "alex@nyu.edu",
              "Attendance Status": "Attended",
            },
            issues: [],
          },
          {
            rowNumber: 3,
            attendee: { attendanceStatus: "Attended" },
            originalRow: {
              "Campus Email": "",
              "Attendance Status": "Attended",
            },
            issues: [
              {
                code: "missing_nyu_email",
                severity: "error",
                message: "A fake row is missing an NYU email.",
                rowNumber: 3,
              },
            ],
          },
          {
            rowNumber: 4,
            attendee: { email: "blair@nyu.edu" },
            originalRow: {
              "Campus Email": "blair@nyu.edu",
              "Attendance Status": "",
            },
            issues: [],
          },
        ],
        fileIssues: [],
        detectedHeaders: ["Campus Email", "Attendance Status"],
        validRowCount: 2,
        invalidRowCount: 1,
      },
    };

    expect(summarizeAttendance(result)).toEqual({
      sourceRowCount: 3,
      attendedCount: 2,
      notAttendedCount: 0,
      unknownCount: 1,
      resolvedIdentityCount: 2,
      unresolvedIdentityCount: 1,
    });
  });

  it("does not count a Luma registration without check-in as attendance", () => {
    const result: AttendanceImportResult = {
      source: "luma",
      data: {
        rows: [
          {
            rowNumber: 2,
            attendee: {
              email: "casey@example.com",
              registrationStatus: "registered",
            },
            originalRow: {
              Email: "casey@example.com",
              "Registration Status": "registered",
            },
            issues: [],
          },
        ],
        fileIssues: [],
        detectedHeaders: ["Email", "Registration Status"],
        validRowCount: 1,
        invalidRowCount: 0,
      },
    };

    expect(summarizeAttendance(result)).toMatchObject({
      attendedCount: 0,
      unknownCount: 1,
      resolvedIdentityCount: 1,
    });
  });

  it("returns an empty summary for an unrecognized import", () => {
    expect(
      summarizeAttendance({
        source: "unknown",
        data: {
          rows: [],
          fileIssues: [],
          detectedHeaders: [],
          validRowCount: 0,
          invalidRowCount: 0,
        },
      }),
    ).toEqual({
      sourceRowCount: 0,
      attendedCount: 0,
      notAttendedCount: 0,
      unknownCount: 0,
      resolvedIdentityCount: 0,
      unresolvedIdentityCount: 0,
    });
  });
});

describe("summarizeSessionEvents", () => {
  it("aggregates totals across multiple session events", () => {
    const records = [
      {
        attendance: {
          fileName: "event-a.csv",
          fileSize: 100,
          result: {
            source: "luma" as const,
            data: {
              rows: [
                {
                  rowNumber: 2,
                  attendee: {
                    email: "alex@example.com",
                    checkInTime: "2026-08-01 18:05",
                  },
                  originalRow: { Email: "alex@example.com" },
                  issues: [],
                },
                {
                  rowNumber: 3,
                  attendee: { email: "blair@example.com" },
                  originalRow: { Email: "blair@example.com" },
                  issues: [],
                },
              ],
              fileIssues: [],
              detectedHeaders: ["Email"],
              validRowCount: 2,
              invalidRowCount: 0,
            },
          },
        },
      },
      {
        attendance: {
          fileName: "event-b.csv",
          fileSize: 100,
          result: {
            source: "engage" as const,
            data: {
              metadata: {},
              rows: [
                {
                  rowNumber: 2,
                  attendee: {
                    email: "casey@nyu.edu",
                    attendanceStatus: "Attended",
                  },
                  originalRow: { "Campus Email": "casey@nyu.edu" },
                  issues: [],
                },
              ],
              fileIssues: [],
              detectedHeaders: ["Campus Email"],
              validRowCount: 1,
              invalidRowCount: 0,
            },
          },
        },
      },
    ];

    expect(summarizeSessionEvents(records)).toEqual({
      eventCount: 2,
      sourceRowCount: 3,
      attendedCount: 2,
      notAttendedCount: 0,
      unknownCount: 1,
      resolvedIdentityCount: 3,
      unresolvedIdentityCount: 0,
    });
  });

  it("returns zeros for no events", () => {
    expect(summarizeSessionEvents([])).toEqual({
      eventCount: 0,
      sourceRowCount: 0,
      attendedCount: 0,
      notAttendedCount: 0,
      unknownCount: 0,
      resolvedIdentityCount: 0,
      unresolvedIdentityCount: 0,
    });
  });
});
