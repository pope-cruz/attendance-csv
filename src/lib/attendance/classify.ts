import type { AttendanceClassification } from "@/types/attendance";
import type { EngageAttendee, LumaAttendee } from "@/types/import";

export function classifyLumaAttendance(
  attendee: LumaAttendee | undefined,
): AttendanceClassification {
  const rawCheckInTime = attendee?.checkInTime?.trim();
  if (rawCheckInTime) {
    return {
      status: "attended",
      basis: "luma_check_in",
      rawValue: attendee?.checkInTime,
    };
  }

  const rawCheckedIn = attendee?.checkedIn?.trim().toLowerCase();
  if (rawCheckedIn) {
    // Luma sometimes exports "Checked In" as Yes/No, True/False, 1/0, or "checked in"
    const truthy = new Set(["yes", "y", "true", "1", "checked in", "checked-in", "attended"]);
    const falsy = new Set(["no", "n", "false", "0", "not checked in", "not checked-in", ""]);

    if (truthy.has(rawCheckedIn)) {
      return {
        status: "attended",
        basis: "luma_check_in",
        rawValue: attendee?.checkedIn,
      };
    }
    if (falsy.has(rawCheckedIn)) {
      return {
        status: "unknown",
        basis: "missing_attendance_signal",
      };
    }
    // Any other non-empty "Checked In" value (e.g. time string) counts as attended
    if (attendee?.checkedIn?.trim()) {
      return {
        status: "attended",
        basis: "luma_check_in",
        rawValue: attendee?.checkedIn,
      };
    }
  }

  return {
    status: "unknown",
    basis: "missing_attendance_signal",
  };
}

export function classifyEngageAttendance(
  attendee: EngageAttendee,
): AttendanceClassification {
  const rawStatus = attendee.attendanceStatus;
  const normalizedStatus = rawStatus?.trim().toLowerCase();

  if (!normalizedStatus) {
    return {
      status: "unknown",
      basis: "missing_attendance_signal",
    };
  }

  if (normalizedStatus === "attended") {
    return {
      status: "attended",
      basis: "engage_status",
      rawValue: rawStatus,
    };
  }

  return {
    status: "unknown",
    basis: "unrecognized_attendance_status",
    rawValue: rawStatus,
  };
}
