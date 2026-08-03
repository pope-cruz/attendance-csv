import Papa from "papaparse";

import type {
  AttendanceImportResult,
  CsvSourceDetection,
  ImportIssue,
  UnknownImportResult,
} from "@/types/import";

import { parseEngageCsv } from "./engage";
import { parseLumaCsv } from "./luma";

function normalizeHeader(header: string): string {
  return header
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

function isEngageHeader(row: string[]): boolean {
  const headers = new Set(row.map(normalizeHeader));
  return (
    headers.has("attendance status") &&
    (headers.has("campus email") || headers.has("preferred email"))
  );
}

function isLumaHeader(row: string[]): boolean {
  const headers = new Set(row.map(normalizeHeader));
  const hasEmail = ["email", "email address", "guest email"].some((header) =>
    headers.has(header),
  );
  const hasLumaCompanion = [
    "name",
    "full name",
    "guest name",
    "first name",
    "guest first name",
    "last name",
    "guest last name",
    "approval status",
    "registration status",
    "check in time",
    "checked in at",
    "checkin time",
    "ticket type",
  ].some((header) => headers.has(header));

  return hasEmail && hasLumaCompanion;
}

export function detectCsvSource(csvText: string): CsvSourceDetection {
  if (csvText.trim() === "") {
    return { source: "unknown", reason: "empty" };
  }

  const parsed = Papa.parse<string[]>(csvText, { skipEmptyLines: false });
  const rows = parsed.data.map((row) => row.map((cell) => String(cell ?? "")));
  const looksLikeEngage = rows.some(isEngageHeader);
  const looksLikeLuma = rows.some(isLumaHeader);

  if (looksLikeEngage && looksLikeLuma) {
    return { source: "unknown", reason: "ambiguous" };
  }
  if (looksLikeEngage) {
    return { source: "engage" };
  }
  if (looksLikeLuma) {
    return { source: "luma" };
  }

  return { source: "unknown", reason: "unrecognized" };
}

function unknownResult(issue: ImportIssue): UnknownImportResult {
  return {
    rows: [],
    fileIssues: [issue],
    detectedHeaders: [],
    validRowCount: 0,
    invalidRowCount: 0,
  };
}

export function parseAttendanceCsv(csvText: string): AttendanceImportResult {
  const detection = detectCsvSource(csvText);

  if (detection.source === "luma") {
    return { source: "luma", data: parseLumaCsv(csvText) };
  }
  if (detection.source === "engage") {
    return { source: "engage", data: parseEngageCsv(csvText) };
  }
  if (detection.reason === "empty") {
    return {
      source: "unknown",
      data: unknownResult({
        code: "empty_file",
        severity: "error",
        message: "The selected CSV file is empty.",
      }),
    };
  }
  if (detection.reason === "ambiguous") {
    return {
      source: "unknown",
      data: unknownResult({
        code: "ambiguous_csv_source",
        severity: "error",
        message:
          "This file contains both Luma and NYU Engage headers, so its source cannot be selected safely.",
      }),
    };
  }

  return {
    source: "unknown",
    data: unknownResult({
      code: "unknown_csv_source",
      severity: "error",
      message:
        "Could not recognize this CSV. Choose an unmodified Luma guests export or NYU Engage attendance export.",
    }),
  };
}
