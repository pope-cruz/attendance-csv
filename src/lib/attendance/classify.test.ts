import { describe, expect, it } from "vitest";

import {
  classifyEngageAttendance,
  classifyLumaAttendance,
} from "./classify";

describe("classifyLumaAttendance", () => {
  it("classifies a non-empty check-in time as attended", () => {
    expect(
      classifyLumaAttendance({
        email: "alex@example.com",
        checkInTime: "2026-08-01 18:05",
      }),
    ).toEqual({
      status: "attended",
      basis: "luma_check_in",
      rawValue: "2026-08-01 18:05",
    });
  });

  it("does not treat registration or approval as proof of attendance", () => {
    expect(
      classifyLumaAttendance({
        email: "blair@example.com",
        approvalStatus: "approved",
        registrationStatus: "registered",
      }),
    ).toEqual({
      status: "unknown",
      basis: "missing_attendance_signal",
    });
  });

  it("classifies a missing attendee as unknown", () => {
    expect(classifyLumaAttendance(undefined).status).toBe("unknown");
  });

  it.each([
    "Yes",
    "Y",
    "true",
    "1",
    "checked in",
    "checked-in",
    "attended",
    "  YES  ",
  ])("classifies the explicit affirmative value %j as attended", (checkedIn) => {
    expect(
      classifyLumaAttendance({
        email: "alex@example.com",
        checkedIn,
      }),
    ).toMatchObject({
      status: "attended",
      basis: "luma_check_in",
      rawValue: checkedIn,
    });
  });

  it.each([
    "No",
    "N",
    "false",
    "0",
    "not checked in",
    "not checked-in",
    "  NO  ",
  ])("classifies the explicit negative value %j as unknown", (checkedIn) => {
    expect(
      classifyLumaAttendance({
        email: "blair@example.com",
        checkedIn,
      }),
    ).toEqual({
      status: "unknown",
      basis: "missing_attendance_signal",
    });
  });

  it("preserves an unfamiliar Checked In value without treating it as attendance", () => {
    expect(
      classifyLumaAttendance({
        email: "casey@example.com",
        checkedIn: "Pending review",
      }),
    ).toEqual({
      status: "unknown",
      basis: "unrecognized_luma_check_in",
      rawValue: "Pending review",
    });
  });

  it("gives a check-in time precedence over a negative Checked In value", () => {
    expect(
      classifyLumaAttendance({
        email: "devon@example.com",
        checkInTime: "2026-08-01 18:05",
        checkedIn: "No",
      }),
    ).toEqual({
      status: "attended",
      basis: "luma_check_in",
      rawValue: "2026-08-01 18:05",
    });
  });
});

describe("classifyEngageAttendance", () => {
  it("normalizes case and whitespace when recognizing attended", () => {
    expect(
      classifyEngageAttendance({
        email: "casey@nyu.edu",
        attendanceStatus: "  ATTENDED  ",
      }),
    ).toEqual({
      status: "attended",
      basis: "engage_status",
      rawValue: "  ATTENDED  ",
    });
  });

  it("classifies a blank attendance status as unknown", () => {
    expect(classifyEngageAttendance({ email: "devon@nyu.edu" })).toEqual({
      status: "unknown",
      basis: "missing_attendance_signal",
    });
  });

  it("preserves an unrecognized status without guessing its meaning", () => {
    expect(
      classifyEngageAttendance({
        email: "ellis@nyu.edu",
        attendanceStatus: "Excused",
      }),
    ).toEqual({
      status: "unknown",
      basis: "unrecognized_attendance_status",
      rawValue: "Excused",
    });
  });
});
