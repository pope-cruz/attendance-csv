import Papa, { type ParseError } from "papaparse";

import type {
  CsvSourceRow,
  EngageAttendee,
  EngageEventMetadata,
  EngageImportResult,
  EngageImportRow,
  ImportIssue,
} from "@/types/import";
import {
  EMAIL_PATTERN,
  isNyuEmail,
  normalizeEmail,
  normalizeHeader,
} from "@/lib/matching/normalize";

const HEADER_ALIASES = {
  firstName: ["first name"],
  lastName: ["last name"],
  campusEmail: ["campus email"],
  preferredEmail: ["preferred email"],
  attendanceStatus: ["attendance status"],
  markedBy: ["marked by"],
  markedOn: ["marked on"],
  comments: ["comments"],
  cardIdNumber: ["card id number", "card id"],
} as const;

function isBlankRow(row: string[]): boolean {
  return row.every((cell) => cell.trim() === "");
}

function findHeaderRowIndex(rows: string[][]): number {
  return rows.findIndex((row) => {
    const headers = new Set(row.map(normalizeHeader));
    const hasEmail =
      headers.has("campus email") || headers.has("preferred email");

    return headers.has("attendance status") && hasEmail;
  });
}

function findColumnIndex(
  headers: string[],
  aliases: readonly string[],
): number | undefined {
  const index = headers.findIndex((header) =>
    aliases.includes(normalizeHeader(header)),
  );

  return index >= 0 ? index : undefined;
}

function readCell(row: string[], index: number | undefined): string {
  return index === undefined ? "" : (row[index] ?? "").trim();
}



function joinName(firstName: string, lastName: string): string {
  return [firstName, lastName].filter(Boolean).join(" ");
}

function uniqueSourceHeaders(headers: string[]): string[] {
  const counts = new Map<string, number>();

  return headers.map((header, index) => {
    const baseHeader = header.trim() || `Column ${index + 1}`;
    const count = (counts.get(baseHeader) ?? 0) + 1;
    counts.set(baseHeader, count);
    return count === 1 ? baseHeader : `${baseHeader} (${count})`;
  });
}

function toSourceRow(
  row: string[],
  sourceHeaders: string[],
): CsvSourceRow {
  const entries: [string, string | string[]][] = sourceHeaders.map(
    (header, index) => [header, row[index] ?? ""],
  );
  const extraCells = row.slice(sourceHeaders.length);

  if (extraCells.length > 0) {
    entries.push(["__parsed_extra", extraCells]);
  }

  return Object.fromEntries(entries);
}

function firstValueAfterLabel(row: string[]): string | undefined {
  return row.slice(1).map((cell) => cell.trim()).find(Boolean);
}

function extractMetadata(rows: string[][]): EngageEventMetadata {
  let startDate: string | undefined;
  let endDate: string | undefined;
  let firstDateRowIndex = rows.length;

  rows.forEach((row, index) => {
    const label = normalizeHeader(row[0] ?? "");
    if (label === "start date") {
      startDate = firstValueAfterLabel(row);
      firstDateRowIndex = Math.min(firstDateRowIndex, index);
    }
    if (label === "end date") {
      endDate = firstValueAfterLabel(row);
      firstDateRowIndex = Math.min(firstDateRowIndex, index);
    }
  });

  const name = rows
    .slice(0, firstDateRowIndex)
    .toReversed()
    .find((row) => {
      const values = row.map((cell) => cell.trim()).filter(Boolean);
      return (
        values.length === 1 &&
        normalizeHeader(values[0] ?? "") !== "event attendance by event"
      );
    })
    ?.find((cell) => cell.trim())
    ?.trim();

  return {
    ...(name && { name }),
    ...(startDate && { startDate }),
    ...(endDate && { endDate }),
  };
}

function issueForParseError(error: ParseError, rowNumber?: number): ImportIssue {
  return {
    code: "malformed_csv",
    severity: "error",
    message: `CSV parsing error: ${error.message}`,
    rowNumber,
  };
}

function addEmailIssues(
  attendee: EngageAttendee,
  rowNumber: number,
): ImportIssue[] {
  const issues: ImportIssue[] = [];
  const sourceEmails = [
    ["Campus Email", attendee.campusEmail],
    ["Preferred Email", attendee.preferredEmail],
  ] as const;

  for (const [label, email] of sourceEmails) {
    if (email && !EMAIL_PATTERN.test(email)) {
      issues.push({
        code: "invalid_email",
        severity: "error",
        message: `${label} “${email}” is not valid.`,
        rowNumber,
      });
    }
  }

  const nyuEmails = new Set(
    sourceEmails
      .map(([, email]) => email)
      .filter((email): email is string => Boolean(email && isNyuEmail(email))),
  );

  if (nyuEmails.size === 0) {
    issues.push({
      code: "missing_nyu_email",
      severity: "error",
      message: "Could not find an @nyu.edu address in Campus Email or Preferred Email.",
      rowNumber,
    });
  } else if (nyuEmails.size > 1) {
    issues.push({
      code: "conflicting_nyu_emails",
      severity: "error",
      message: "Campus Email and Preferred Email contain different @nyu.edu addresses.",
      rowNumber,
    });
  }

  return issues;
}

function addDuplicateEmailIssues(rows: EngageImportRow[]): void {
  const rowsByEmail = new Map<string, EngageImportRow[]>();

  for (const row of rows) {
    const email = row.attendee.email;
    if (!email) {
      continue;
    }

    rowsByEmail.set(email, [...(rowsByEmail.get(email) ?? []), row]);
  }

  for (const [email, duplicateRows] of rowsByEmail) {
    if (duplicateRows.length < 2) {
      continue;
    }

    for (const row of duplicateRows) {
      row.issues.push({
        code: "duplicate_email",
        severity: "error",
        message: `Email ${email} appears more than once in this file.`,
        rowNumber: row.rowNumber,
      });
    }
  }
}

export function parseEngageCsv(csvText: string): EngageImportResult {
  if (csvText.trim() === "") {
    return {
      metadata: {},
      rows: [],
      fileIssues: [
        {
          code: "empty_file",
          severity: "error",
          message: "The selected CSV file is empty.",
        },
      ],
      detectedHeaders: [],
      validRowCount: 0,
      invalidRowCount: 0,
    };
  }

  const parsed = Papa.parse<string[]>(csvText, { skipEmptyLines: false });
  const rows = parsed.data.map((row) => row.map((cell) => String(cell ?? "")));
  const headerRowIndex = findHeaderRowIndex(rows);

  if (headerRowIndex < 0) {
    return {
      metadata: {},
      rows: [],
      fileIssues: [
        ...parsed.errors.map((error) => issueForParseError(error)),
        {
          code: "missing_engage_header",
          severity: "error",
          message:
            "Could not find the NYU Engage attendee header. Expected Attendance Status and at least one Engage email column.",
        },
      ],
      detectedHeaders: [],
      validRowCount: 0,
      invalidRowCount: 0,
    };
  }

  const detectedHeaders = rows[headerRowIndex] ?? [];
  const sourceHeaders = uniqueSourceHeaders(detectedHeaders);
  const columnIndexes = Object.fromEntries(
    Object.entries(HEADER_ALIASES).map(([field, aliases]) => [
      field,
      findColumnIndex(detectedHeaders, aliases),
    ]),
  ) as Record<keyof typeof HEADER_ALIASES, number | undefined>;
  const fileIssues: ImportIssue[] = [];
  const parseErrorsByRow = new Map<number, ParseError[]>();

  for (const error of parsed.errors) {
    if (typeof error.row === "number" && error.row > headerRowIndex) {
      parseErrorsByRow.set(error.row, [
        ...(parseErrorsByRow.get(error.row) ?? []),
        error,
      ]);
    } else {
      fileIssues.push(issueForParseError(error));
    }
  }

  const importRows: EngageImportRow[] = [];

  rows.slice(headerRowIndex + 1).forEach((row, relativeIndex) => {
    if (isBlankRow(row)) {
      return;
    }

    const rowIndex = headerRowIndex + relativeIndex + 1;
    const rowNumber = rowIndex + 1;
    const firstName = readCell(row, columnIndexes.firstName);
    const lastName = readCell(row, columnIndexes.lastName);
    const campusEmail = normalizeEmail(readCell(row, columnIndexes.campusEmail));
    const preferredEmail = normalizeEmail(
      readCell(row, columnIndexes.preferredEmail),
    );
    const nyuEmails = new Set(
      [campusEmail, preferredEmail].filter(isNyuEmail),
    );
    const selectedEmail =
      nyuEmails.size === 1 ? nyuEmails.values().next().value : undefined;
    const name = joinName(firstName, lastName);
    const attendee: EngageAttendee = {
      ...(selectedEmail && { email: selectedEmail }),
      ...(name && { name }),
      ...(firstName && { firstName }),
      ...(lastName && { lastName }),
      ...(campusEmail && { campusEmail }),
      ...(preferredEmail && { preferredEmail }),
      ...(readCell(row, columnIndexes.attendanceStatus) && {
        attendanceStatus: readCell(row, columnIndexes.attendanceStatus),
      }),
      ...(readCell(row, columnIndexes.markedBy) && {
        markedBy: readCell(row, columnIndexes.markedBy),
      }),
      ...(readCell(row, columnIndexes.markedOn) && {
        markedOn: readCell(row, columnIndexes.markedOn),
      }),
      ...(readCell(row, columnIndexes.comments) && {
        comments: readCell(row, columnIndexes.comments),
      }),
      ...(readCell(row, columnIndexes.cardIdNumber) && {
        cardIdNumber: readCell(row, columnIndexes.cardIdNumber),
      }),
    };
    const issues = (parseErrorsByRow.get(rowIndex) ?? []).map((error) =>
      issueForParseError(error, rowNumber),
    );

    if (row.length > detectedHeaders.length) {
      issues.push({
        code: "malformed_csv",
        severity: "error",
        message: `Row has ${row.length - detectedHeaders.length} more value${row.length - detectedHeaders.length === 1 ? "" : "s"} than the header.`,
        rowNumber,
      });
    }

    issues.push(...addEmailIssues(attendee, rowNumber));
    importRows.push({
      rowNumber,
      attendee,
      originalRow: toSourceRow(row, sourceHeaders),
      issues,
    });
  });

  addDuplicateEmailIssues(importRows);

  const invalidRowCount = importRows.filter(
    (row) => row.issues.length > 0,
  ).length;

  return {
    metadata: extractMetadata(rows.slice(0, headerRowIndex)),
    rows: importRows,
    fileIssues,
    detectedHeaders,
    validRowCount: importRows.length - invalidRowCount,
    invalidRowCount,
  };
}
