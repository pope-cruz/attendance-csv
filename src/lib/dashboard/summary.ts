import { classifyEngageAttendance, classifyLumaAttendance } from "@/lib/attendance/classify";
import { normalizeEmail } from "@/lib/matching/normalize";
import type { EventDetails, SessionEventRecord } from "@/types/event";
import type { ImportIssue } from "@/types/import";

export const ATTENDANCE_BASELINE = 31;
export const ATTENDANCE_TARGET = ATTENDANCE_BASELINE * 1.25;
export const ATTENDANCE_STRETCH_TARGET = ATTENDANCE_BASELINE * 1.4;

const RETENTION_WINDOW_DAYS = 90;
const DAY_IN_MILLISECONDS = 24 * 60 * 60 * 1_000;
const INACTIVE_RSVP_STATUSES = new Set([
  "cancelled",
  "canceled",
  "declined",
  "rejected",
  "waitlist",
  "waitlisted",
]);

interface CalendarDate {
  year: number;
  month: number;
  day: number;
}

interface DatedRecord {
  record: SessionEventRecord;
  date: CalendarDate;
  timestamp: number;
}

interface EventPersonStatus {
  attended: boolean;
  rsvped: boolean;
}

interface EventFacts {
  people: Map<string, EventPersonStatus>;
  attendeeEmails: Set<string>;
  rsvpCount: number;
  excludedAttendedRowCount: number;
}

interface DashboardContext {
  factsByEventId: Map<string, EventFacts>;
  timestampByEventId: Map<string, number>;
  firstAttendanceByEmail: Map<string, number>;
  attendanceDatesByEmail: Map<string, number[]>;
  eventTimestamps: number[];
  latestEventTimestamp: number | null;
}

export interface DashboardPeriodStats {
  label: string;
  eventCount: number;
  uniqueAttendeeCount: number;
  confirmedCheckInCount: number;
  averageAttendance: number;
  attendanceGrowthRate: number;
  rsvpCount: number;
  showRate: number | null;
  newAttendeeCount: number;
  returningCheckInRate: number | null;
  repeatAttendanceRate: number | null;
  repeatAttendanceEligibleCount: number;
  excludedAttendedRowCount: number;
  available: boolean;
}

export interface DashboardEventSummary {
  id: string;
  name: string;
  dateLabel: string;
  attendedCount: number;
  rsvpCount: number;
  showRate: number | null;
  newAttendeeCount: number;
  returningAttendeeCount: number;
  excludedAttendedRowCount: number;
  rollingAverage?: number;
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
  latestSemesterTrend: DashboardEventSummary[];
  semesterGroups: DashboardSemesterGroup[];
  undatedEvents: DashboardEventSummary[];
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

function dateTimestamp(date: CalendarDate): number {
  return Date.UTC(date.year, date.month - 1, date.day);
}

function hasUsableIdentity(
  email: string | undefined,
  issues: ImportIssue[],
): email is string {
  return Boolean(email?.trim()) && !issues.some((issue) => issue.severity === "error");
}

function normalizedStatus(value: string | undefined): string {
  return value?.trim().toLowerCase() ?? "";
}

function isLumaRsvp(
  attendee: {
    approvalStatus?: string;
    registrationStatus?: string;
  },
  attended: boolean,
): boolean {
  if (attended) return true;

  const approvalStatus = normalizedStatus(attendee.approvalStatus);
  const registrationStatus = normalizedStatus(attendee.registrationStatus);

  if (
    INACTIVE_RSVP_STATUSES.has(approvalStatus) ||
    INACTIVE_RSVP_STATUSES.has(registrationStatus)
  ) {
    return false;
  }

  return (
    approvalStatus === "approved" ||
    registrationStatus === "registered" ||
    registrationStatus === "confirmed"
  );
}

function isEngageRsvp(attendanceStatus: string | undefined, attended: boolean): boolean {
  if (attended) return true;

  // Engage attendance exports are event rosters, so a resolved row is an RSVP
  // unless its status explicitly says the registration was inactive.
  return !INACTIVE_RSVP_STATUSES.has(normalizedStatus(attendanceStatus));
}

function buildEventFacts(record: SessionEventRecord): EventFacts {
  const people = new Map<string, EventPersonStatus>();
  let excludedAttendedRowCount = 0;

  function addPerson(
    email: string | undefined,
    issues: ImportIssue[],
    attended: boolean,
    rsvped: boolean,
  ): void {
    if (!hasUsableIdentity(email, issues)) {
      if (attended) excludedAttendedRowCount += 1;
      return;
    }

    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail) {
      if (attended) excludedAttendedRowCount += 1;
      return;
    }

    const current = people.get(normalizedEmail);
    people.set(normalizedEmail, {
      attended: Boolean(current?.attended || attended),
      rsvped: Boolean(current?.rsvped || rsvped || attended),
    });
  }

  if (record.attendance.result.source === "luma") {
    for (const row of record.attendance.result.data.rows) {
      const attendee = row.attendee;
      const attended =
        classifyLumaAttendance(attendee).status === "attended";
      addPerson(
        attendee?.email,
        row.issues,
        attended,
        attendee ? isLumaRsvp(attendee, attended) : false,
      );
    }
  }

  if (record.attendance.result.source === "engage") {
    for (const row of record.attendance.result.data.rows) {
      const attendee = row.attendee;
      const attended =
        classifyEngageAttendance(attendee).status === "attended";
      addPerson(
        attendee.email,
        row.issues,
        attended,
        isEngageRsvp(attendee.attendanceStatus, attended),
      );
    }
  }

  const attendeeEmails = new Set(
    [...people.entries()]
      .filter(([, status]) => status.attended)
      .map(([email]) => email),
  );
  const rsvpCount = [...people.values()].filter((status) => status.rsvped).length;

  return {
    people,
    attendeeEmails,
    rsvpCount,
    excludedAttendedRowCount,
  };
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

function buildDashboardContext(
  records: SessionEventRecord[],
  datedRecords: DatedRecord[],
): DashboardContext {
  const factsByEventId = new Map(
    records.map((record) => [record.id, buildEventFacts(record)]),
  );
  const timestampByEventId = new Map(
    datedRecords.map(({ record, timestamp }) => [record.id, timestamp]),
  );
  const attendanceDatesByEmail = new Map<string, number[]>();

  for (const { record, timestamp } of datedRecords) {
    const facts = factsByEventId.get(record.id);
    if (!facts) continue;

    for (const email of facts.attendeeEmails) {
      const dates = attendanceDatesByEmail.get(email) ?? [];
      dates.push(timestamp);
      attendanceDatesByEmail.set(email, dates);
    }
  }

  for (const dates of attendanceDatesByEmail.values()) {
    dates.sort((a, b) => a - b);
  }

  const firstAttendanceByEmail = new Map(
    [...attendanceDatesByEmail.entries()]
      .filter((entry): entry is [string, [number, ...number[]]] => entry[1].length > 0)
      .map(([email, dates]) => [email, dates[0]]),
  );
  const eventTimestamps = [...new Set(datedRecords.map(({ timestamp }) => timestamp))]
    .sort((a, b) => a - b);

  return {
    factsByEventId,
    timestampByEventId,
    firstAttendanceByEmail,
    attendanceDatesByEmail,
    eventTimestamps,
    latestEventTimestamp: eventTimestamps.at(-1) ?? null,
  };
}

function eventSummary(
  record: SessionEventRecord,
  context: DashboardContext,
): DashboardEventSummary {
  const facts = context.factsByEventId.get(record.id) ?? buildEventFacts(record);
  const timestamp = context.timestampByEventId.get(record.id);
  let newAttendeeCount = 0;
  let returningAttendeeCount = 0;

  if (timestamp !== undefined) {
    for (const email of facts.attendeeEmails) {
      const firstAttendance = context.firstAttendanceByEmail.get(email);
      if (firstAttendance === timestamp) newAttendeeCount += 1;
      if (firstAttendance !== undefined && firstAttendance < timestamp) {
        returningAttendeeCount += 1;
      }
    }
  }

  return {
    id: record.id,
    name: record.details.name,
    dateLabel: eventDateLabel(record.details),
    attendedCount: facts.attendeeEmails.size,
    rsvpCount: facts.rsvpCount,
    showRate:
      facts.rsvpCount > 0 ? facts.attendeeEmails.size / facts.rsvpCount : null,
    newAttendeeCount,
    returningAttendeeCount,
    excludedAttendedRowCount: facts.excludedAttendedRowCount,
  };
}

function periodStats(
  label: string,
  records: SessionEventRecord[],
  context: DashboardContext,
  available = true,
): DashboardPeriodStats {
  const uniqueAttendeeEmails = new Set<string>();
  const newAttendeeEmails = new Set<string>();
  const periodTimestamps = new Set<number>();
  let confirmedCheckInCount = 0;
  let rsvpCount = 0;
  let returningCheckInCount = 0;
  let excludedAttendedRowCount = 0;

  for (const record of records) {
    const facts = context.factsByEventId.get(record.id);
    if (!facts) continue;

    const timestamp = context.timestampByEventId.get(record.id);
    if (timestamp !== undefined) periodTimestamps.add(timestamp);

    confirmedCheckInCount += facts.attendeeEmails.size;
    rsvpCount += facts.rsvpCount;
    excludedAttendedRowCount += facts.excludedAttendedRowCount;

    for (const email of facts.attendeeEmails) {
      uniqueAttendeeEmails.add(email);
      const firstAttendance = context.firstAttendanceByEmail.get(email);
      if (timestamp !== undefined && firstAttendance === timestamp) {
        newAttendeeEmails.add(email);
      }
      if (
        timestamp !== undefined &&
        firstAttendance !== undefined &&
        firstAttendance < timestamp
      ) {
        returningCheckInCount += 1;
      }
    }
  }

  const retentionCohort = [...newAttendeeEmails].filter((email) => {
    const firstAttendance = context.firstAttendanceByEmail.get(email);
    if (firstAttendance === undefined || context.latestEventTimestamp === null) {
      return false;
    }

    const windowEnd = firstAttendance + RETENTION_WINDOW_DAYS * DAY_IN_MILLISECONDS;
    const hasMatured = context.latestEventTimestamp >= windowEnd;
    const hadReturnOpportunity = context.eventTimestamps.some(
      (timestamp) => timestamp > firstAttendance && timestamp <= windowEnd,
    );
    return hasMatured && hadReturnOpportunity;
  });
  const repeatedWithinWindowCount = retentionCohort.filter((email) => {
    const firstAttendance = context.firstAttendanceByEmail.get(email);
    if (firstAttendance === undefined) return false;
    const windowEnd = firstAttendance + RETENTION_WINDOW_DAYS * DAY_IN_MILLISECONDS;
    return (context.attendanceDatesByEmail.get(email) ?? []).some(
      (timestamp) => timestamp > firstAttendance && timestamp <= windowEnd,
    );
  }).length;

  const averageAttendance =
    records.length > 0 ? confirmedCheckInCount / records.length : 0;

  return {
    label,
    eventCount: records.length,
    uniqueAttendeeCount: uniqueAttendeeEmails.size,
    confirmedCheckInCount,
    averageAttendance,
    attendanceGrowthRate:
      (averageAttendance - ATTENDANCE_BASELINE) / ATTENDANCE_BASELINE,
    rsvpCount,
    showRate: rsvpCount > 0 ? confirmedCheckInCount / rsvpCount : null,
    newAttendeeCount: newAttendeeEmails.size,
    returningCheckInRate:
      confirmedCheckInCount > 0
        ? returningCheckInCount / confirmedCheckInCount
        : null,
    repeatAttendanceRate:
      retentionCohort.length > 0
        ? repeatedWithinWindowCount / retentionCohort.length
        : null,
    repeatAttendanceEligibleCount: retentionCohort.length,
    excludedAttendedRowCount,
    available,
  };
}

function withRollingAverage(
  events: DashboardEventSummary[],
): DashboardEventSummary[] {
  return events.map((event, index) => {
    const window = events.slice(Math.max(0, index - 2), index + 1);
    return {
      ...event,
      rollingAverage:
        window.reduce((sum, item) => sum + item.attendedCount, 0) /
        window.length,
    };
  });
}

export function buildDashboardSummary(
  records: SessionEventRecord[],
): DashboardSummary {
  const datedRecords: DatedRecord[] = [];
  const undatedRecords: SessionEventRecord[] = [];

  for (const record of records) {
    const date = recordDate(record);
    if (date) {
      datedRecords.push({ record, date, timestamp: dateTimestamp(date) });
    } else {
      undatedRecords.push(record);
    }
  }

  datedRecords.sort(
    (a, b) =>
      dateSortValue(b.date) - dateSortValue(a.date) ||
      a.record.details.name.localeCompare(b.record.details.name),
  );

  const context = buildDashboardContext(records, datedRecords);
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
      events: group.records.map(({ record }) => eventSummary(record, context)),
    }));

  const latestSemesterTrend = withRollingAverage(
    latestSemesterRecords
      .map((record) => eventSummary(record, context))
      .toReversed(),
  );

  return {
    latestSemester: latestDatedRecord
      ? periodStats(
          semesterLabel(latestDatedRecord.date),
          latestSemesterRecords,
          context,
        )
      : periodStats("Latest semester", [], context, false),
    academicYear:
      latestAcademicYearStart === null
        ? periodStats("Academic year", [], context, false)
        : periodStats(
            academicYearLabel(latestAcademicYearStart),
            academicYearRecords,
            context,
          ),
    allTime: periodStats("All time", records, context),
    latestSemesterTrend,
    semesterGroups,
    undatedEvents: undatedRecords
      .slice()
      .sort((a, b) => a.details.name.localeCompare(b.details.name))
      .map((record) => ({
        ...eventSummary(record, context),
        dateLabel: "Date needed",
      })),
  };
}
