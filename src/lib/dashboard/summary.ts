import {
  summarizeAttendance,
  summarizeSessionEvents,
} from "@/lib/attendance/summary";
import { groupByMember } from "@/lib/matching/history";
import type { EventDetails, SessionEventRecord } from "@/types/event";

interface CalendarDate {
  year: number;
  month: number;
  day: number;
}

export interface DashboardPeriodStats {
  label: string;
  eventCount: number;
  uniqueAttendeeCount: number;
  averageAttendance: number;
  available: boolean;
}

export interface DashboardEventSummary {
  id: string;
  name: string;
  dateLabel: string;
  attendedCount: number;
}

export interface DashboardSemesterGroup {
  key: string;
  label: string;
  events: DashboardEventSummary[];
}

export interface DashboardSummary {
  latestSemester: DashboardPeriodStats;
  academicYear: DashboardPeriodStats;
  allTime: DashboardPeriodStats;
  semesterGroups: DashboardSemesterGroup[];
  undatedEvents: DashboardEventSummary[];
}

interface DatedRecord {
  record: SessionEventRecord;
  date: CalendarDate;
}

function isCalendarDate(year: number, month: number, day: number): boolean {
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function calendarDate(
  year: number,
  month: number,
  day: number,
): CalendarDate | null {
  return isCalendarDate(year, month, day) ? { year, month, day } : null;
}

function parseCalendarDate(value: string): CalendarDate | null {
  const trimmedValue = value.trim();
  if (!trimmedValue) return null;

  const isoMatch = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(trimmedValue);
  if (isoMatch) {
    return calendarDate(
      Number(isoMatch[1]),
      Number(isoMatch[2]),
      Number(isoMatch[3]),
    );
  }

  const usMatch = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(trimmedValue);
  if (usMatch) {
    return calendarDate(
      Number(usMatch[3]),
      Number(usMatch[1]),
      Number(usMatch[2]),
    );
  }

  const timestamp = Date.parse(trimmedValue);
  if (Number.isNaN(timestamp)) return null;

  const parsedDate = new Date(timestamp);
  return calendarDate(
    parsedDate.getUTCFullYear(),
    parsedDate.getUTCMonth() + 1,
    parsedDate.getUTCDate(),
  );
}

function recordDate(record: SessionEventRecord): CalendarDate | null {
  return (
    parseCalendarDate(record.details.startDate) ??
    parseCalendarDate(record.details.endDate)
  );
}

function dateSortValue(date: CalendarDate): number {
  return date.year * 10_000 + date.month * 100 + date.day;
}

function semesterName(date: CalendarDate): "Spring" | "Fall" {
  return date.month <= 6 ? "Spring" : "Fall";
}

function semesterKey(date: CalendarDate): string {
  return `${date.year}-${semesterName(date).toLowerCase()}`;
}

function semesterLabel(date: CalendarDate): string {
  return `${semesterName(date)} ${date.year}`;
}

function semesterSortValue(date: CalendarDate): number {
  return date.year * 2 + (date.month >= 7 ? 1 : 0);
}

function academicYearStart(date: CalendarDate): number {
  return date.month >= 7 ? date.year : date.year - 1;
}

function academicYearLabel(startYear: number): string {
  const endYear = String((startYear + 1) % 100).padStart(2, "0");
  return `AY ${startYear}\u2013${endYear}`;
}

function eventDateLabel(details: EventDetails): string {
  if (details.startDate && details.startDate === details.endDate) {
    return details.startDate;
  }
  if (details.startDate && details.endDate) {
    return `${details.startDate} \u2013 ${details.endDate}`;
  }
  return details.startDate || details.endDate || "Date needed";
}

function eventSummary(record: SessionEventRecord): DashboardEventSummary {
  return {
    id: record.id,
    name: record.details.name,
    dateLabel: eventDateLabel(record.details),
    attendedCount: summarizeAttendance(record.attendance.result).attendedCount,
  };
}

function periodStats(
  label: string,
  records: SessionEventRecord[],
  available = true,
): DashboardPeriodStats {
  const attendanceSummary = summarizeSessionEvents(records);
  const uniqueAttendeeCount = groupByMember(records).filter(
    (member) => member.attendedCount > 0,
  ).length;

  return {
    label,
    eventCount: records.length,
    uniqueAttendeeCount,
    averageAttendance:
      records.length > 0 ? attendanceSummary.attendedCount / records.length : 0,
    available,
  };
}

export function buildDashboardSummary(
  records: SessionEventRecord[],
): DashboardSummary {
  const datedRecords: DatedRecord[] = [];
  const undatedRecords: SessionEventRecord[] = [];

  for (const record of records) {
    const date = recordDate(record);
    if (date) {
      datedRecords.push({ record, date });
    } else {
      undatedRecords.push(record);
    }
  }

  datedRecords.sort(
    (a, b) =>
      dateSortValue(b.date) - dateSortValue(a.date) ||
      a.record.details.name.localeCompare(b.record.details.name),
  );

  const latestDatedRecord = datedRecords[0];
  const latestSemesterRecords = latestDatedRecord
    ? datedRecords
        .filter(({ date }) => semesterKey(date) === semesterKey(latestDatedRecord.date))
        .map(({ record }) => record)
    : [];
  const latestAcademicYearStart = latestDatedRecord
    ? academicYearStart(latestDatedRecord.date)
    : null;
  const academicYearRecords =
    latestAcademicYearStart === null
      ? []
      : datedRecords
          .filter(
            ({ date }) => academicYearStart(date) === latestAcademicYearStart,
          )
          .map(({ record }) => record);

  const semesterGroupsByKey = new Map<
    string,
    { date: CalendarDate; records: DatedRecord[] }
  >();
  for (const datedRecord of datedRecords) {
    const key = semesterKey(datedRecord.date);
    const group = semesterGroupsByKey.get(key) ?? {
      date: datedRecord.date,
      records: [],
    };
    group.records.push(datedRecord);
    semesterGroupsByKey.set(key, group);
  }

  const semesterGroups = [...semesterGroupsByKey.entries()]
    .sort(
      ([, a], [, b]) =>
        semesterSortValue(b.date) - semesterSortValue(a.date),
    )
    .map(([key, group]) => ({
      key,
      label: semesterLabel(group.date),
      events: group.records.map(({ record }) => eventSummary(record)),
    }));

  return {
    latestSemester: latestDatedRecord
      ? periodStats(
          semesterLabel(latestDatedRecord.date),
          latestSemesterRecords,
        )
      : periodStats("Latest semester", [], false),
    academicYear:
      latestAcademicYearStart === null
        ? periodStats("Academic year", [], false)
        : periodStats(
            academicYearLabel(latestAcademicYearStart),
            academicYearRecords,
          ),
    allTime: periodStats("All time", records),
    semesterGroups,
    undatedEvents: undatedRecords
      .slice()
      .sort((a, b) => a.details.name.localeCompare(b.details.name))
      .map((record) => ({
        ...eventSummary(record),
        dateLabel: "Date needed",
      })),
  };
}
