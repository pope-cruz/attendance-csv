import { classifyEngageAttendance, classifyLumaAttendance } from "@/lib/attendance/classify";
import { normalizeEmail } from "@/lib/matching/normalize";
import type { SessionEventRecord } from "@/types/event";

export interface MemberEventAttendance {
  eventId: string;
  eventName: string;
  eventDate: string;
  source: "luma" | "engage";
  attended: boolean;
  /** For Luma: "approved / registered" etc., for Engage: raw attendanceStatus */
  rsvpLabel?: string;
  rawAttendanceValue?: string;
  rowNumber: number;
}

export interface Member {
  normalizedEmail: string;
  displayEmail: string;
  displayName: string;
  eventCount: number;
  attendedCount: number;
  attendedEvents: MemberEventAttendance[];
  allEvents: MemberEventAttendance[];
}

function eventDateLabel(details: SessionEventRecord["details"]): string {
  if (details.startDate && details.startDate === details.endDate) return details.startDate;
  if (details.startDate && details.endDate) return `${details.startDate} — ${details.endDate}`;
  return details.startDate || details.endDate || "";
}

export function groupByMember(records: SessionEventRecord[]): Member[] {
  const byEmail = new Map<string, Member>();

  for (const record of records) {
    const dateLabel = eventDateLabel(record.details);

    if (record.attendance.result.source === "luma") {
      for (const row of record.attendance.result.data.rows) {
        const attendee = row.attendee;
        if (!attendee?.email) continue;

        const normalized = normalizeEmail(attendee.email);
        if (!normalized) continue;

        const classification = classifyLumaAttendance(attendee);
        const attended = classification.status === "attended";
        const rsvpParts = [attendee.approvalStatus, attendee.registrationStatus, attendee.ticketType].filter(
          (v): v is string => Boolean(v?.trim()),
        );
        const rsvpLabel = rsvpParts.length > 0 ? rsvpParts.join(" • ") : undefined;

        const entry: MemberEventAttendance = {
          eventId: record.id,
          eventName: record.details.name,
          eventDate: dateLabel,
          source: "luma",
          attended,
          rsvpLabel,
          rawAttendanceValue: classification.rawValue,
          rowNumber: row.rowNumber,
        };

        let member = byEmail.get(normalized);
        if (!member) {
          member = {
            normalizedEmail: normalized,
            displayEmail: attendee.email,
            displayName: attendee.name || attendee.email,
            eventCount: 0,
            attendedCount: 0,
            attendedEvents: [],
            allEvents: [],
          };
          byEmail.set(normalized, member);
        }

        // Prefer first non-email name if we get a better one
        if (attendee.name && member.displayName === member.displayEmail) {
          member.displayName = attendee.name;
        }

        member.allEvents.push(entry);
        if (attended) {
          member.attendedCount += 1;
          member.attendedEvents.push(entry);
        }
      }
    }

    if (record.attendance.result.source === "engage") {
      for (const row of record.attendance.result.data.rows) {
        const attendee = row.attendee;
        // Only count resolved NYU identities — attendee.email is undefined for missing/conflicting
        if (!attendee.email) continue;

        const normalized = normalizeEmail(attendee.email);
        if (!normalized) continue;

        const classification = classifyEngageAttendance(attendee);
        const attended = classification.status === "attended";

        const entry: MemberEventAttendance = {
          eventId: record.id,
          eventName: record.details.name,
          eventDate: dateLabel,
          source: "engage",
          attended,
          rsvpLabel: attendee.attendanceStatus?.trim() || undefined,
          rawAttendanceValue: attendee.attendanceStatus,
          rowNumber: row.rowNumber,
        };

        let member = byEmail.get(normalized);
        if (!member) {
          member = {
            normalizedEmail: normalized,
            displayEmail: attendee.email,
            displayName: attendee.name || attendee.email,
            eventCount: 0,
            attendedCount: 0,
            attendedEvents: [],
            allEvents: [],
          };
          byEmail.set(normalized, member);
        }

        if (attendee.name && member.displayName === member.displayEmail) {
          member.displayName = attendee.name;
        }

        member.allEvents.push(entry);
        if (attended) {
          member.attendedCount += 1;
          member.attendedEvents.push(entry);
        }
      }
    }
  }

  // Finalize counts: distinct events per member
  for (const member of byEmail.values()) {
    const distinctEventIds = new Set(member.allEvents.map((e) => e.eventId));
    member.eventCount = distinctEventIds.size;
  }

  // Leaderboard order: most attended desc, then eventCount desc, then name
  return [...byEmail.values()].sort(
    (a, b) =>
      b.attendedCount - a.attendedCount ||
      b.eventCount - a.eventCount ||
      a.displayName.localeCompare(b.displayName),
  );
}
