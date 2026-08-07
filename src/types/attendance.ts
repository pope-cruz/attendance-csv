export type AttendanceStatus = "attended" | "not_attended" | "unknown";

export type AttendanceClassificationBasis =
  | "luma_check_in"
  | "engage_status"
  | "missing_attendance_signal"
  | "unrecognized_luma_check_in"
  | "unrecognized_attendance_status";

export interface AttendanceClassification {
  status: AttendanceStatus;
  basis: AttendanceClassificationBasis;
  rawValue?: string;
}

export interface EventAttendanceSummary {
  sourceRowCount: number;
  attendedCount: number;
  notAttendedCount: number;
  unknownCount: number;
  resolvedIdentityCount: number;
  unresolvedIdentityCount: number;
}
