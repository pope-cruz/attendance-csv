import { describe, expect, it } from "vitest";

import type { SessionEventRecord } from "@/types/event";
import type { ImportIssueCode, LumaImportRow, RowResolution } from "@/types/import";

import {
  REVIEW_PAGE_SIZE,
  applyRowResolution,
  buildReviewQueue,
  filterReviewQueue,
  paginateReviewQueue,
  reviewQueueStats,
} from "./queue";

function row(
  rowNumber: number,
  code: ImportIssueCode,
  attended = false,
  resolution?: RowResolution,
): LumaImportRow {
  return {
    rowNumber,
    attendee: {
      email: `person-${rowNumber}@example.com`,
      name: `Person ${rowNumber}`,
      ...(attended ? { checkedIn: "Yes" } : {}),
    },
    originalRow: { Email: `person-${rowNumber}@example.com` },
    issues: [{ code, severity: "error", message: `Fake ${code}`, rowNumber }],
    ...(resolution ? { resolution } : {}),
  };
}

function record(id: string, rows: LumaImportRow[]): SessionEventRecord {
  return {
    id,
    details: { name: `Event ${id}`, eventUrl: "", instagramUrl: "", startDate: "", endDate: "" },
    attendance: {
      fileName: `${id}.csv`,
      fileSize: 100,
      result: {
        source: "luma",
        data: {
          rows,
          fileIssues: [],
          detectedHeaders: ["Email"],
          validRowCount: 0,
          invalidRowCount: rows.length,
        },
      },
    },
  };
}

const audit = {
  note: "Checked the roster.",
  resolverLabel: "PC",
  resolvedAt: "2026-08-13T12:00:00Z",
};

describe("review queue", () => {
  it("includes every row error category, ignores warnings, and prioritizes open attendance", () => {
    const codes: ImportIssueCode[] = [
      "missing_email_header",
      "missing_email",
      "missing_nyu_email",
      "conflicting_nyu_emails",
      "invalid_email",
      "duplicate_email",
      "malformed_csv",
    ];
    const warningRow = row(99, "malformed_csv");
    warningRow.issues[0] = { ...warningRow.issues[0]!, severity: "warning" };
    const queue = buildReviewQueue([
      record("older", [...codes.map((code, index) => row(index + 2, code)), warningRow]),
      record("newer", [row(20, "invalid_email", true)]),
    ]);

    expect(queue).toHaveLength(codes.length + 1);
    expect(new Set(queue.map((item) => item.issues[0]?.code))).toEqual(new Set(codes));
    expect(queue[0]).toMatchObject({ eventId: "newer", rowNumber: 20, attended: true });
  });

  it("filters open and resolved rows and computes queue counts", () => {
    const corrected: RowResolution = {
      status: "corrected",
      email: "fixed@example.com",
      ...audit,
    };
    const excluded: RowResolution = { status: "excluded", ...audit };
    const queue = buildReviewQueue([
      record("one", [
        row(2, "invalid_email", true),
        row(3, "duplicate_email", false, corrected),
        row(4, "malformed_csv", false, excluded),
      ]),
    ]);

    expect(reviewQueueStats(queue)).toEqual({
      openCount: 1,
      openAttendedCount: 1,
      correctedCount: 1,
      excludedCount: 1,
    });
    expect(filterReviewQueue(queue, { view: "open", query: "", attendedOnly: true })).toHaveLength(1);
    expect(
      filterReviewQueue(queue, {
        view: "resolved",
        query: "duplicate",
        issueCode: "duplicate_email",
        attendedOnly: false,
      }),
    ).toHaveLength(1);
  });

  it("paginates rows beyond the upload preview limit", () => {
    const queue = buildReviewQueue([
      record("large", Array.from({ length: 120 }, (_, index) => row(index + 2, "invalid_email"))),
    ]);
    expect(paginateReviewQueue(queue, 1)).toHaveLength(REVIEW_PAGE_SIZE);
    expect(paginateReviewQueue(queue, 3)).toHaveLength(20);
    expect(paginateReviewQueue(queue, 3)[0]?.rowNumber).toBe(102);
  });

  it("applies a saved resolution without changing source fields", () => {
    const records = [record("one", [row(2, "invalid_email", true)])];
    const resolution: RowResolution = {
      status: "corrected",
      email: "fixed@example.com",
      ...audit,
    };
    const updated = applyRowResolution(records, "one", 2, resolution);
    const originalRow = records[0]?.attendance.result.data.rows[0];
    const updatedRow = updated[0]?.attendance.result.data.rows[0];

    expect(updatedRow?.resolution).toEqual(resolution);
    expect(updatedRow?.originalRow).toEqual(originalRow?.originalRow);
    expect(updatedRow?.issues).toEqual(originalRow?.issues);
    expect(updatedRow && "attendee" in updatedRow ? updatedRow.attendee : undefined).toEqual(
      originalRow && "attendee" in originalRow ? originalRow.attendee : undefined,
    );
  });
});
