import { classifyEngageAttendance, classifyLumaAttendance } from "@/lib/attendance/classify";
import { normalizeEmail } from "@/lib/matching/normalize";
import type { SessionEventRecord } from "@/types/event";
import type { ImportIssue } from "@/types/import";

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

interface MemberCandidate {
  displayEmail: string;
  displayName: string;
  event: MemberEventAttendance;
}

function eventDateLabel(details: SessionEventRecord["details"]): string {
  if (details.startDate && details.startDate === details.endDate) return details.startDate;
  if (details.startDate && details.endDate) return `${details.startDate} — ${details.endDate}`;
  return details.startDate || details.endDate || "";
}

function hasUsableIdentity(
  email: string | undefined,
  issues: ImportIssue[],
): email is string {
  return Boolean(email?.trim()) && !issues.some((issue) => issue.severity === "error");
}

function addCandidate(
  candidatesByEmail: Map<string, MemberCandidate[]>,
  email: string,
  name: string | undefined,
  event: MemberEventAttendance,
): void {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return;

  const candidate: MemberCandidate = {
    displayEmail: email,
    displayName: name || email,
    event,
  };
  const candidates = candidatesByEmail.get(normalizedEmail) ?? [];
  candidates.push(candidate);
  candidatesByEmail.set(normalizedEmail, candidates);
}

export function groupByMember(records: SessionEventRecord[]): Member[] {
  const candidatesByEmail = new Map<string, MemberCandidate[]>();

  for (const record of records) {
    const dateLabel = eventDateLabel(record.details);

    if (record.attendance.result.source === "luma") {
      for (const row of record.attendance.result.data.rows) {
        const attendee = row.attendee;
        if (!hasUsableIdentity(attendee?.email, row.issues)) continue;

        const classification = classifyLumaAttendance(attendee);
        const attended = classification.status === "attended";
        const rsvpParts = [attendee.approvalStatus, attendee.registrationStatus, attendee.ticketType].filter(
          (v): v is string => Boolean(v?.trim()),
        );
        const rsvpLabel = rsvpParts.length > 0 ? rsvpParts.join(" • ") : undefined;

        addCandidate(candidatesByEmail, attendee.email, attendee.name, {
          eventId: record.id,
          eventName: record.details.name,
          eventDate: dateLabel,
          source: "luma",
          attended,
          rsvpLabel,
          rawAttendanceValue: classification.rawValue,
          rowNumber: row.rowNumber,
        });
      }
    }

    if (record.attendance.result.source === "engage") {
      for (const row of record.attendance.result.data.rows) {
        const attendee = row.attendee;
        if (!hasUsableIdentity(attendee.email, row.issues)) continue;

        const classification = classifyEngageAttendance(attendee);
        const attended = classification.status === "attended";

        addCandidate(candidatesByEmail, attendee.email, attendee.name, {
          eventId: record.id,
          eventName: record.details.name,
          eventDate: dateLabel,
          source: "engage",
          attended,
          rsvpLabel: attendee.attendanceStatus?.trim() || undefined,
          rawAttendanceValue: attendee.attendanceStatus,
          rowNumber: row.rowNumber,
        });
      }
    }
  }

  const members: Member[] = [];

  for (const [normalizedEmail, candidates] of candidatesByEmail) {
    const candidatesByEvent = new Map<string, MemberCandidate[]>();
    for (const candidate of candidates) {
      const eventCandidates = candidatesByEvent.get(candidate.event.eventId) ?? [];
      eventCandidates.push(candidate);
      candidatesByEvent.set(candidate.event.eventId, eventCandidates);
    }

    const unambiguousCandidates = [...candidatesByEvent.values()]
      .filter((eventCandidates) => eventCandidates.length === 1)
      .map((eventCandidates) => eventCandidates[0]);
    const completeCandidates = unambiguousCandidates.filter(
      (candidate): candidate is MemberCandidate => candidate !== undefined,
    );

    if (completeCandidates.length === 0) continue;

    const namedCandidate = completeCandidates.find(
      (candidate) => candidate.displayName !== candidate.displayEmail,
    );
    const representative = namedCandidate ?? completeCandidates[0];
    if (!representative) continue;

    const allEvents = completeCandidates.map((candidate) => candidate.event);
    const attendedEvents = allEvents.filter((event) => event.attended);
    members.push({
      normalizedEmail,
      displayEmail: representative.displayEmail,
      displayName: representative.displayName,
      eventCount: allEvents.length,
      attendedCount: attendedEvents.length,
      attendedEvents,
      allEvents,
    });
  }

  // Leaderboard order: most attended desc, then eventCount desc, then name
  return members.sort(
    (a, b) =>
      b.attendedCount - a.attendedCount ||
      b.eventCount - a.eventCount ||
      a.displayName.localeCompare(b.displayName),
  );
}
