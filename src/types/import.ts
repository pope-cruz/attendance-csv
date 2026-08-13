export type CsvSourceRow = Record<string, string | string[]>;

export type ImportIssueSeverity = "error" | "warning";

export type ImportIssueCode =
  | "empty_file"
  | "unknown_csv_source"
  | "ambiguous_csv_source"
  | "missing_email_header"
  | "missing_engage_header"
  | "missing_email"
  | "missing_nyu_email"
  | "conflicting_nyu_emails"
  | "invalid_email"
  | "duplicate_email"
  | "malformed_csv";

export interface ImportIssue {
  code: ImportIssueCode;
  severity: ImportIssueSeverity;
  message: string;
  rowNumber?: number;
}

interface RowResolutionAudit {
  note: string;
  resolverLabel: string;
  resolvedBy?: string;
  resolvedAt: string;
}

export type RowResolution =
  | (RowResolutionAudit & {
      status: "corrected";
      email: string;
      name?: string;
    })
  | (RowResolutionAudit & {
      status: "excluded";
    });

export interface LumaAttendee {
  email: string;
  name?: string;
  approvalStatus?: string;
  registrationStatus?: string;
  checkInTime?: string;
  checkedIn?: string;
  ticketType?: string;
}

export interface LumaImportRow {
  rowNumber: number;
  attendee?: LumaAttendee;
  originalRow: CsvSourceRow;
  issues: ImportIssue[];
  resolution?: RowResolution;
}

export interface LumaImportResult {
  rows: LumaImportRow[];
  fileIssues: ImportIssue[];
  detectedHeaders: string[];
  validRowCount: number;
  invalidRowCount: number;
}

export interface EngageEventMetadata {
  name?: string;
  startDate?: string;
  endDate?: string;
}

export interface EngageAttendee {
  email?: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  campusEmail?: string;
  preferredEmail?: string;
  attendanceStatus?: string;
  markedBy?: string;
  markedOn?: string;
  comments?: string;
  cardIdNumber?: string;
}

export interface EngageImportRow {
  rowNumber: number;
  attendee: EngageAttendee;
  originalRow: CsvSourceRow;
  issues: ImportIssue[];
  resolution?: RowResolution;
}

export interface EngageImportResult {
  metadata: EngageEventMetadata;
  rows: EngageImportRow[];
  fileIssues: ImportIssue[];
  detectedHeaders: string[];
  validRowCount: number;
  invalidRowCount: number;
}

export interface UnknownImportResult {
  rows: [];
  fileIssues: ImportIssue[];
  detectedHeaders: [];
  validRowCount: 0;
  invalidRowCount: 0;
}

export type CsvSource = "luma" | "engage";

export type CsvSourceDetection =
  | { source: "luma" }
  | { source: "engage" }
  | { source: "unknown"; reason: "empty" | "unrecognized" | "ambiguous" };

export type AttendanceImportResult =
  | { source: "luma"; data: LumaImportResult }
  | { source: "engage"; data: EngageImportResult }
  | { source: "unknown"; data: UnknownImportResult };
