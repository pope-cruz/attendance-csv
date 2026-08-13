import { describe, expect, it } from "vitest";

import type { SessionEventRecord } from "@/types/event";

import { buildDashboardSummary } from "./summary";

interface FakeAttendee {
  email: string;
  attended: boolean;
}

function lumaRecord(
  id: string,
  name: string,
  date: string,
  attendees: FakeAttendee[],
): SessionEventRecord {
  return {
    id,
    details: {
      name,
      eventUrl: "",
      instagramUrl: "",
      startDate: date,
      endDate: date,
    },
    attendance: {
      fileName: `${id}.csv`,
      fileSize: 100,
      result: {
        source: "luma",
        data: {
          rows: attendees.map((attendee, index) => ({
            rowNumber: index + 2,
            attendee: {
              email: attendee.email,
              name: attendee.email.split("@")[0],
              ...(attendee.attended
                ? { checkedIn: "Yes" }
                : { approvalStatus: "Approved", registrationStatus: "Registered" }),
            },
            originalRow: { Email: attendee.email },
            issues: [],
          })),
          fileIssues: [],
          detectedHeaders: ["Email", "Checked In"],
          validRowCount: attendees.length,
          invalidRowCount: 0,
        },
      },
    },
  };
}

function engageRecord(
  id: string,
  name: string,
  date: string,
  attendees: FakeAttendee[],
): SessionEventRecord {
  return {
    id,
    details: {
      name,
      eventUrl: "",
      instagramUrl: "",
      startDate: date,
      endDate: date,
    },
    attendance: {
      fileName: `${id}.csv`,
      fileSize: 100,
      result: {
        source: "engage",
        data: {
          metadata: {},
          rows: attendees.map((attendee, index) => ({
            rowNumber: index + 7,
            attendee: {
              email: attendee.email,
              campusEmail: attendee.email,
              attendanceStatus: attendee.attended ? "Attended" : "Registered",
            },
            originalRow: { "Campus Email": attendee.email },
            issues: [],
          })),
          fileIssues: [],
          detectedHeaders: ["Campus Email", "Attendance Status"],
          validRowCount: attendees.length,
          invalidRowCount: 0,
        },
      },
    },
  };
}

describe("buildDashboardSummary", () => {
  it("builds latest-semester, academic-year, and all-time stats", () => {
    const records = [
      lumaRecord("spring", "Spring Demo", "6/30/2026", [
        { email: "alex@nyu.edu", attended: true },
        { email: "rsvp@nyu.edu", attended: false },
      ]),
      engageRecord("fall-one", "Fall Kickoff", "2026-07-01", [
        { email: "ALEX@NYU.EDU", attended: true },
        { email: "casey@nyu.edu", attended: true },
      ]),
      lumaRecord("fall-two", "Fall Workshop", "August 4, 2026", [
        { email: "casey@nyu.edu", attended: true },
        { email: "no-show@nyu.edu", attended: false },
      ]),
    ];

    const summary = buildDashboardSummary(records);

    expect(summary.latestSemester).toMatchObject({
      label: "Fall 2026",
      eventCount: 2,
      uniqueAttendeeCount: 2,
      confirmedCheckInCount: 3,
      averageAttendance: 1.5,
      rsvpCount: 4,
      showRate: 0.75,
      newAttendeeCount: 1,
      returningCheckInRate: 2 / 3,
      available: true,
    });
    expect(summary.academicYear).toMatchObject({
      label: "AY 2026\u201327",
      eventCount: 2,
      uniqueAttendeeCount: 2,
      averageAttendance: 1.5,
    });
    expect(summary.allTime).toMatchObject({
      eventCount: 3,
      uniqueAttendeeCount: 2,
      averageAttendance: 4 / 3,
    });
  });

  it("counts distinct usable identities and surfaces excluded checked-in rows", () => {
    const record = lumaRecord("quality", "Quality Review", "2026-08-01", [
      { email: "alex@nyu.edu", attended: true },
      { email: "ALEX@NYU.EDU", attended: true },
    ]);

    if (record.attendance.result.source !== "luma") {
      throw new Error("Expected a Luma test record.");
    }

    record.attendance.result.data.rows.push({
      rowNumber: 4,
      attendee: { email: "broken", checkedIn: "Yes" },
      originalRow: { Email: "broken", "Checked In": "Yes" },
      issues: [
        {
          code: "invalid_email",
          severity: "error",
          message: "Fake invalid email.",
          rowNumber: 4,
        },
      ],
    });

    const summary = buildDashboardSummary([record]);

    expect(summary.latestSemester).toMatchObject({
      confirmedCheckInCount: 1,
      uniqueAttendeeCount: 1,
      excludedAttendedRowCount: 1,
    });
    expect(summary.latestSemesterTrend[0]).toMatchObject({
      attendedCount: 1,
      excludedAttendedRowCount: 1,
    });
  });

  it("includes corrected identities and continues to exclude explicitly excluded rows", () => {
    const record = lumaRecord("resolutions", "Resolution Review", "2026-08-01", []);
    if (record.attendance.result.source !== "luma") throw new Error("Expected Luma.");
    const issue = {
      code: "invalid_email" as const,
      severity: "error" as const,
      message: "Fake invalid email.",
      rowNumber: 2,
    };
    record.attendance.result.data.rows.push(
      {
        rowNumber: 2,
        attendee: { email: "broken", checkedIn: "Yes" },
        originalRow: { Email: "broken" },
        issues: [issue],
        resolution: {
          status: "corrected",
          email: "fixed@nyu.edu",
          note: "Checked the roster.",
          resolverLabel: "PC",
          resolvedAt: "2026-08-13T12:00:00Z",
        },
      },
      {
        rowNumber: 3,
        attendee: { email: "duplicate@nyu.edu", checkedIn: "Yes" },
        originalRow: { Email: "duplicate@nyu.edu" },
        issues: [{ ...issue, rowNumber: 3 }],
        resolution: {
          status: "excluded",
          note: "Duplicate registration.",
          resolverLabel: "PC",
          resolvedAt: "2026-08-13T12:00:00Z",
        },
      },
    );

    expect(buildDashboardSummary([record]).allTime).toMatchObject({
      confirmedCheckInCount: 1,
      uniqueAttendeeCount: 1,
      excludedAttendedRowCount: 1,
    });
  });

  it("derives new, returning, and matured 90-day repeat metrics chronologically", () => {
    const summary = buildDashboardSummary([
      lumaRecord("first", "First Event", "2026-01-01", [
        { email: "alex@nyu.edu", attended: true },
        { email: "blair@nyu.edu", attended: true },
        { email: "no-show@nyu.edu", attended: false },
      ]),
      engageRecord("second", "Second Event", "2026-02-01", [
        { email: "alex@nyu.edu", attended: true },
        { email: "casey@nyu.edu", attended: true },
        { email: "engage-no-show@nyu.edu", attended: false },
      ]),
      lumaRecord("maturity", "Maturity Event", "2026-04-15", [
        { email: "drew@nyu.edu", attended: true },
      ]),
    ]);

    expect(summary.latestSemester).toMatchObject({
      eventCount: 3,
      confirmedCheckInCount: 5,
      uniqueAttendeeCount: 4,
      rsvpCount: 7,
      showRate: 5 / 7,
      newAttendeeCount: 4,
      returningCheckInRate: 1 / 5,
      repeatAttendanceRate: 1 / 2,
      repeatAttendanceEligibleCount: 2,
    });
    expect(summary.latestSemesterTrend.map((event) => event.name)).toEqual([
      "First Event",
      "Second Event",
      "Maturity Event",
    ]);
    expect(summary.latestSemesterTrend.map((event) => event.rollingAverage)).toEqual([
      2,
      2,
      5 / 3,
    ]);
  });

  it("keeps Spring and Fall separate while joining them into one academic year", () => {
    const summary = buildDashboardSummary([
      lumaRecord("fall", "Fall Event", "12/1/2025", [
        { email: "fall@nyu.edu", attended: true },
      ]),
      engageRecord("spring", "Spring Event", "1/15/2026", [
        { email: "spring@nyu.edu", attended: true },
      ]),
    ]);

    expect(summary.latestSemester.label).toBe("Spring 2026");
    expect(summary.latestSemester.eventCount).toBe(1);
    expect(summary.academicYear.label).toBe("AY 2025\u201326");
    expect(summary.academicYear.eventCount).toBe(2);
    expect(summary.semesterGroups.map((group) => group.label)).toEqual([
      "Spring 2026",
      "Fall 2025",
    ]);
  });

  it("sorts events newest first and keeps undated events visible", () => {
    const undated = lumaRecord("undated", "Needs a Date", "", [
      { email: "undated@nyu.edu", attended: true },
    ]);
    undated.details.endDate = "not a date";

    const summary = buildDashboardSummary([
      lumaRecord("older", "Older", "2026-07-02", []),
      lumaRecord("newer", "Newer", "2026-08-02", []),
      undated,
    ]);

    expect(summary.semesterGroups[0]?.events.map((event) => event.name)).toEqual([
      "Newer",
      "Older",
    ]);
    expect(summary.undatedEvents).toMatchObject([
      { id: "undated", name: "Needs a Date", dateLabel: "Date needed" },
    ]);
    expect(summary.allTime.eventCount).toBe(3);
  });

  it("returns safe empty reporting windows", () => {
    const summary = buildDashboardSummary([]);

    expect(summary.latestSemester).toMatchObject({
      eventCount: 0,
      uniqueAttendeeCount: 0,
      averageAttendance: 0,
      available: false,
    });
    expect(summary.academicYear.available).toBe(false);
    expect(summary.allTime).toMatchObject({
      eventCount: 0,
      uniqueAttendeeCount: 0,
      averageAttendance: 0,
    });
  });
});
