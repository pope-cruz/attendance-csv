import type { AttendanceImportResult } from "@/types/import";

export interface EventDetails {
  name: string;
  eventUrl: string;
  instagramUrl: string;
  startDate: string;
  endDate: string;
}

export interface EventAttendanceImport {
  fileName: string;
  fileSize: number;
  result: AttendanceImportResult;
}

export interface SessionEventRecord {
  id: string;
  details: EventDetails;
  attendance: EventAttendanceImport;
}
