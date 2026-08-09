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
      averageAttendance: 1.5,
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
