import Papa, { type ParseError } from "papaparse";

import type {
  CsvSourceRow,
  ImportIssue,
  LumaAttendee,
  LumaImportResult,
  LumaImportRow,
} from "@/types/import";
import {
  EMAIL_PATTERN,
  normalizeEmail,
  normalizeHeader,
} from "@/lib/matching/normalize";

const HEADER_ALIASES = {
  email: ["email", "email address", "guest email"],
  name: ["name", "full name", "guest name"],
  firstName: ["first name", "guest first name"],
  lastName: ["last name", "guest last name"],
  approvalStatus: ["approval status"],
  registrationStatus: ["registration status"],
  checkInTime: ["check in time", "checked in at", "checkin time", "checked-in at"],
  checkedIn: ["checked in", "checked-in", "checked in status", "check in status", "attendance"],
  ticketType: ["ticket type"],
} as const;

function findHeader(
  headers: string[],
  aliases: readonly string[],
): string | undefined {
  return headers.find((header) => aliases.includes(normalizeHeader(header)));
}

function readCell(row: CsvSourceRow, header: string | undefined): string {
  if (!header) {
    return "";
  }

  const value = row[header];
  return Array.isArray(value) ? value.join(", ").trim() : (value ?? "").trim();
}

function joinName(firstName: string, lastName: string): string {
  return [firstName, lastName].filter(Boolean).join(" ");
}

function toSourceRow(row: Record<string, unknown>): CsvSourceRow {
  return Object.fromEntries(
    Object.entries(row).map(([header, value]) => {
      if (Array.isArray(value)) {
        return [header, value.map((cell) => String(cell ?? ""))];
      }

      return [header, String(value ?? "")];
    }),
  );
}

function issueForParseError(
  error: ParseError,
  rowNumber?: number,
): ImportIssue {
  return {
    code: "malformed_csv",
    severity: "error",
    message: `CSV parsing error: ${error.message}`,
    rowNumber,
  };
}

function buildAttendee(
  row: CsvSourceRow,
  headers: Record<keyof typeof HEADER_ALIASES, string | undefined>,
): LumaAttendee {
  const fullName =
    readCell(row, headers.name) ||
    joinName(
      readCell(row, headers.firstName),
      readCell(row, headers.lastName),
    );

  return {
    email: normalizeEmail(readCell(row, headers.email)),
    ...(fullName && { name: fullName }),
    ...(readCell(row, headers.approvalStatus) && {
      approvalStatus: readCell(row, headers.approvalStatus),
    }),
    ...(readCell(row, headers.registrationStatus) && {
      registrationStatus: readCell(row, headers.registrationStatus),
    }),
    ...(readCell(row, headers.checkInTime) && {
      checkInTime: readCell(row, headers.checkInTime),
    }),
    ...(readCell(row, headers.checkedIn) && {
      checkedIn: readCell(row, headers.checkedIn),
    }),
    ...(readCell(row, headers.ticketType) && {
      ticketType: readCell(row, headers.ticketType),
    }),
  };
}

function addDuplicateEmailIssues(rows: LumaImportRow[]): void {
  const rowsByEmail = new Map<string, LumaImportRow[]>();

  for (const row of rows) {
    const email = row.attendee?.email;
    if (!email || row.issues.length > 0) {
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

export function parseLumaCsv(csvText: string): LumaImportResult {
  if (csvText.trim() === "") {
    return {
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

  const parsed = Papa.parse<Record<string, unknown>>(csvText, {
    header: true,
    skipEmptyLines: "greedy",
  });
  const detectedHeaders = parsed.meta.fields ?? [];
  const matchedHeaders = Object.fromEntries(
    Object.entries(HEADER_ALIASES).map(([field, aliases]) => [
      field,
      findHeader(detectedHeaders, aliases),
    ]),
  ) as Record<keyof typeof HEADER_ALIASES, string | undefined>;
  const fileIssues: ImportIssue[] = [];

  if (!matchedHeaders.email) {
    fileIssues.push({
      code: "missing_email_header",
      severity: "error",
      message:
        "Could not find an email column. Expected Email, Email Address, or Guest Email.",
    });
  }

  const parseErrorsByRow = new Map<number, ParseError[]>();
  for (const error of parsed.errors) {
    if (error.code === "TooFewFields") {
      continue;
    }

    if (typeof error.row === "number" && error.row >= 0) {
      parseErrorsByRow.set(error.row, [
        ...(parseErrorsByRow.get(error.row) ?? []),
        error,
      ]);
    } else {
      fileIssues.push(issueForParseError(error));
    }
  }

  const rows = parsed.data.map((parsedRow, index): LumaImportRow => {
    const rowNumber = index + 2;
    const originalRow = toSourceRow(parsedRow);
    const attendee = buildAttendee(originalRow, matchedHeaders);
    const issues = (parseErrorsByRow.get(index) ?? []).map((error) =>
      issueForParseError(error, rowNumber),
    );

    if (!matchedHeaders.email) {
      issues.push({
        code: "missing_email_header",
        severity: "error",
        message: "Email cannot be read because the file has no recognized email column.",
        rowNumber,
      });
    } else if (attendee.email === "") {
      issues.push({
        code: "missing_email",
        severity: "error",
        message: "Email is required because it is the attendee identity key.",
        rowNumber,
      });
    } else if (!EMAIL_PATTERN.test(attendee.email)) {
      issues.push({
        code: "invalid_email",
        severity: "error",
        message: `Email “${attendee.email}” is not valid.`,
        rowNumber,
      });
    }

    return {
      rowNumber,
      attendee,
      originalRow,
      issues,
    };
  });

  addDuplicateEmailIssues(rows);

  const invalidRowCount = rows.filter((row) => row.issues.length > 0).length;

  return {
    rows,
    fileIssues,
    detectedHeaders,
    validRowCount: rows.length - invalidRowCount,
    invalidRowCount,
  };
}
