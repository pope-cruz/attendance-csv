import type {
  AttendanceStatus,
  EventAttendanceSummary,
} from "@/types/attendance";
import type { AttendanceImportResult, ImportIssue } from "@/types/import";

import { classifyEngageAttendance, classifyLumaAttendance } from "./classify";

const IDENTITY_ISSUE_CODES = new Set<ImportIssue["code"]>([
  "missing_email_header",
  "missing_email",
  "missing_nyu_email",
  "conflicting_nyu_emails",
  "invalid_email",
  "duplicate_email",
]);

function hasResolvedIdentity(
  email: string | undefined,
  issues: ImportIssue[],
): boolean {
  return (
    Boolean(email) &&
    !issues.some((issue) => IDENTITY_ISSUE_CODES.has(issue.code))
  );
}

function emptySummary(): EventAttendanceSummary {
  return {
    sourceRowCount: 0,
    attendedCount: 0,
    notAttendedCount: 0,
    unknownCount: 0,
    resolvedIdentityCount: 0,
    unresolvedIdentityCount: 0,
  };
}

function addClassification(
  summary: EventAttendanceSummary,
  status: AttendanceStatus,
  identityIsResolved: boolean,
): void {
  summary.sourceRowCount += 1;

  if (status === "attended") {
    summary.attendedCount += 1;
  } else if (status === "not_attended") {
    summary.notAttendedCount += 1;
  } else {
    summary.unknownCount += 1;
  }

  if (identityIsResolved) {
    summary.resolvedIdentityCount += 1;
  } else {
    summary.unresolvedIdentityCount += 1;
  }
}

export function summarizeAttendance(
  result: AttendanceImportResult,
): EventAttendanceSummary {
  const summary = emptySummary();

  if (result.source === "luma") {
    for (const row of result.data.rows) {
      addClassification(
        summary,
        classifyLumaAttendance(row.attendee).status,
        hasResolvedIdentity(row.attendee?.email, row.issues),
      );
    }
  }

  if (result.source === "engage") {
    for (const row of result.data.rows) {
      addClassification(
        summary,
        classifyEngageAttendance(row.attendee).status,
        hasResolvedIdentity(row.attendee.email, row.issues),
      );
    }
  }

  return summary;
}

export interface SessionEventsSummary extends EventAttendanceSummary {
  eventCount: number;
}

export function summarizeSessionEvents(
  records: { attendance: { result: AttendanceImportResult } }[],
): SessionEventsSummary {
  const summary: SessionEventsSummary = {
    eventCount: records.length,
    ...emptySummary(),
  };

  for (const record of records) {
    const eventSummary = summarizeAttendance(record.attendance.result);
    summary.sourceRowCount += eventSummary.sourceRowCount;
    summary.attendedCount += eventSummary.attendedCount;
    summary.notAttendedCount += eventSummary.notAttendedCount;
    summary.unknownCount += eventSummary.unknownCount;
    summary.resolvedIdentityCount += eventSummary.resolvedIdentityCount;
    summary.unresolvedIdentityCount += eventSummary.unresolvedIdentityCount;
  }

  return summary;
}
