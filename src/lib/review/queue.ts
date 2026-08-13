import { classifyEngageAttendance, classifyLumaAttendance } from "@/lib/attendance/classify";
import type { SessionEventRecord } from "@/types/event";
import type {
  CsvSource,
  CsvSourceRow,
  ImportIssue,
  ImportIssueCode,
  RowResolution,
} from "@/types/import";

import { hasErrorIssues } from "@/lib/matching/identity";

export const REVIEW_PAGE_SIZE = 50;

export type ReviewView = "open" | "resolved";

export interface ReviewQueueRow {
  eventId: string;
  eventName: string;
  eventDate: string;
  eventOrder: number;
  rowNumber: number;
  source: CsvSource;
  importedEmail?: string;
  importedName?: string;
  attended: boolean;
  attendanceDetail: string;
  issues: ImportIssue[];
  originalRow: CsvSourceRow;
  resolution?: RowResolution;
}

export interface ReviewFilters {
  view: ReviewView;
  query: string;
  eventId?: string;
  issueCode?: ImportIssueCode;
  attendedOnly: boolean;
}

export interface ReviewQueueStats {
  openCount: number;
  openAttendedCount: number;
  correctedCount: number;
  excludedCount: number;
}

function eventDate(record: SessionEventRecord): string {
  return record.details.startDate || record.details.endDate || "Date not added";
}

export function buildReviewQueue(records: SessionEventRecord[]): ReviewQueueRow[] {
  const queue: ReviewQueueRow[] = [];

  records.forEach((record, eventOrder) => {
    const result = record.attendance.result;
    if (result.source === "luma") {
      for (const row of result.data.rows) {
        if (!hasErrorIssues(row.issues)) continue;
        const classification = classifyLumaAttendance(row.attendee);
        queue.push({
          eventId: record.id,
          eventName: record.details.name,
          eventDate: eventDate(record),
          eventOrder,
          rowNumber: row.rowNumber,
          source: "luma",
          ...(row.attendee?.email ? { importedEmail: row.attendee.email } : {}),
          ...(row.attendee?.name ? { importedName: row.attendee.name } : {}),
          attended: classification.status === "attended",
          attendanceDetail: classification.rawValue || "Not checked in",
          issues: row.issues.filter((issue) => issue.severity === "error"),
          originalRow: row.originalRow,
          ...(row.resolution ? { resolution: row.resolution } : {}),
        });
      }
    }

    if (result.source === "engage") {
      for (const row of result.data.rows) {
        if (!hasErrorIssues(row.issues)) continue;
        const classification = classifyEngageAttendance(row.attendee);
        queue.push({
          eventId: record.id,
          eventName: record.details.name,
          eventDate: eventDate(record),
          eventOrder,
          rowNumber: row.rowNumber,
          source: "engage",
          ...(row.attendee.email ? { importedEmail: row.attendee.email } : {}),
          ...(row.attendee.name ? { importedName: row.attendee.name } : {}),
          attended: classification.status === "attended",
          attendanceDetail: classification.rawValue || "Not marked attended",
          issues: row.issues.filter((issue) => issue.severity === "error"),
          originalRow: row.originalRow,
          ...(row.resolution ? { resolution: row.resolution } : {}),
        });
      }
    }
  });

  return queue.sort((a, b) => {
    const aOpen = !a.resolution;
    const bOpen = !b.resolution;
    if (aOpen !== bOpen) return aOpen ? -1 : 1;
    if (aOpen && a.attended !== b.attended) return a.attended ? -1 : 1;
    if (!aOpen && a.resolution && b.resolution) {
      const resolutionOrder = b.resolution.resolvedAt.localeCompare(a.resolution.resolvedAt);
      if (resolutionOrder !== 0) return resolutionOrder;
    }
    return b.eventOrder - a.eventOrder || a.rowNumber - b.rowNumber;
  });
}

export function reviewQueueStats(rows: ReviewQueueRow[]): ReviewQueueStats {
  return rows.reduce<ReviewQueueStats>(
    (stats, row) => {
      if (!row.resolution) {
        stats.openCount += 1;
        if (row.attended) stats.openAttendedCount += 1;
      } else if (row.resolution.status === "corrected") {
        stats.correctedCount += 1;
      } else {
        stats.excludedCount += 1;
      }
      return stats;
    },
    { openCount: 0, openAttendedCount: 0, correctedCount: 0, excludedCount: 0 },
  );
}

export function filterReviewQueue(
  rows: ReviewQueueRow[],
  filters: ReviewFilters,
): ReviewQueueRow[] {
  const query = filters.query.trim().toLowerCase();
  return rows.filter((row) => {
    if (filters.view === "open" ? Boolean(row.resolution) : !row.resolution) return false;
    if (filters.eventId && row.eventId !== filters.eventId) return false;
    if (filters.issueCode && !row.issues.some((issue) => issue.code === filters.issueCode)) {
      return false;
    }
    if (filters.attendedOnly && !row.attended) return false;
    if (
      query &&
      ![
        row.eventName,
        row.importedName,
        row.importedEmail,
        String(row.rowNumber),
        ...row.issues.map((issue) => issue.message),
      ].some((value) => value?.toLowerCase().includes(query))
    ) {
      return false;
    }
    return true;
  });
}

export function paginateReviewQueue(
  rows: ReviewQueueRow[],
  page: number,
): ReviewQueueRow[] {
  const start = Math.max(0, page - 1) * REVIEW_PAGE_SIZE;
  return rows.slice(start, start + REVIEW_PAGE_SIZE);
}

export function applyRowResolution(
  records: SessionEventRecord[],
  eventId: string,
  rowNumber: number,
  resolution: RowResolution,
): SessionEventRecord[] {
  return records.map((record) => {
    if (record.id !== eventId) return record;
    const result = record.attendance.result;
    if (result.source === "unknown") return record;

    return {
      ...record,
      attendance: {
        ...record.attendance,
        result: {
          ...result,
          data: {
            ...result.data,
            rows: result.data.rows.map((row) =>
              row.rowNumber === rowNumber ? { ...row, resolution } : row,
            ),
          },
        } as typeof result,
      },
    };
  });
}
