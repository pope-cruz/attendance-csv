import type {
  AttendanceStatus,
  EventAttendanceSummary,
} from "@/types/attendance";
import type { AttendanceImportResult } from "@/types/import";

import { classifyEngageAttendance, classifyLumaAttendance } from "./classify";
import { effectiveIdentity } from "@/lib/matching/identity";

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
        Boolean(
          effectiveIdentity(
            row.attendee?.email,
            row.attendee?.name,
            row.issues,
            row.resolution,
          ),
        ),
      );
    }
  }

  if (result.source === "engage") {
    for (const row of result.data.rows) {
      addClassification(
        summary,
        classifyEngageAttendance(row.attendee).status,
        Boolean(
          effectiveIdentity(
            row.attendee.email,
            row.attendee.name,
            row.issues,
            row.resolution,
          ),
        ),
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
