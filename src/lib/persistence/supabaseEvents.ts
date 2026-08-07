import { classifyEngageAttendance, classifyLumaAttendance } from "@/lib/attendance/classify";
import { getSupabaseClient } from "@/lib/supabase/client";
import type { SessionEventRecord } from "@/types/event";
import type { AttendanceImportResult } from "@/types/import";

// Supabase tables: events + event_rows (see docs/supabase-checklist.md for SQL)
// This module mirrors src/lib/persistence/events.ts signatures so callers don't change.

type EventRow = {
  id?: string;
  event_id: string;
  row_number: number;
  email: string | null;
  display_email: string | null;
  display_name: string | null;
  source: "luma" | "engage";
  check_in_time: string | null;
  checked_in: string | null;
  approval_status: string | null;
  registration_status: string | null;
  ticket_type: string | null;
  campus_email: string | null;
  preferred_email: string | null;
  attendance_status: string | null;
  attended: boolean;
  rsvp_label: string | null;
  original_row: Record<string, unknown>;
  issues: unknown;
};

type EventPayload = {
  id: string;
  name: string;
  event_url: string | null;
  instagram_url: string | null;
  start_date: string | null;
  end_date: string | null;
  file_name: string;
  file_size: number;
  source: "luma" | "engage";
  detected_headers: string[];
  valid_row_count: number;
  invalid_row_count: number;
};

type SaveEventPayload = {
  event_payload: EventPayload;
  rows_payload: EventRow[];
};

function toSupabaseRows(record: SessionEventRecord): EventRow[] {
  const result: AttendanceImportResult = record.attendance.result;

  if (result.source === "luma") {
    return result.data.rows.map((row) => {
      const a = row.attendee;
      const cls = classifyLumaAttendance(a);
      const rsvp = [a?.approvalStatus, a?.registrationStatus, a?.ticketType].filter(Boolean).join(" • ") || null;
      return {
        event_id: record.id,
        row_number: row.rowNumber,
        email: a?.email ?? null,
        display_email: a?.email ?? null,
        display_name: a?.name ?? null,
        source: "luma",
        check_in_time: a?.checkInTime ?? null,
        checked_in: a?.checkedIn ?? null,
        approval_status: a?.approvalStatus ?? null,
        registration_status: a?.registrationStatus ?? null,
        ticket_type: a?.ticketType ?? null,
        campus_email: null,
        preferred_email: null,
        attendance_status: null,
        attended: cls.status === "attended",
        rsvp_label: rsvp,
        original_row: row.originalRow as Record<string, unknown>,
        issues: row.issues,
      };
    });
  }

  if (result.source === "engage") {
    return result.data.rows.map((row) => {
      const a = row.attendee;
      const cls = classifyEngageAttendance(a);
      return {
        event_id: record.id,
        row_number: row.rowNumber,
        email: a.email ?? null,
        display_email: a.email ?? null,
        display_name: a.name ?? null,
        source: "engage",
        check_in_time: null,
        checked_in: null,
        approval_status: null,
        registration_status: null,
        ticket_type: null,
        campus_email: a.campusEmail ?? null,
        preferred_email: a.preferredEmail ?? null,
        attendance_status: a.attendanceStatus ?? null,
        attended: cls.status === "attended",
        rsvp_label: a.attendanceStatus ?? null,
        original_row: row.originalRow as Record<string, unknown>,
        issues: row.issues,
      };
    });
  }

  return [];
}

function buildSavePayload(record: SessionEventRecord): SaveEventPayload {
  const result = record.attendance.result;
  if (result.source === "unknown") {
    throw new Error("Cannot save an unrecognized attendance source.");
  }

  return {
    event_payload: {
      id: record.id,
      name: record.details.name,
      event_url: record.details.eventUrl || null,
      instagram_url: record.details.instagramUrl || null,
      start_date: record.details.startDate || null,
      end_date: record.details.endDate || null,
      file_name: record.attendance.fileName,
      file_size: record.attendance.fileSize,
      source: result.source,
      detected_headers: result.data.detectedHeaders,
      valid_row_count: result.data.validRowCount,
      invalid_row_count: result.data.invalidRowCount,
    },
    rows_payload: toSupabaseRows(record),
  };
}

export async function loadEventRecords(): Promise<SessionEventRecord[]> {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.");

  const { data: events, error: eventsError } = await supabase
    .from("events")
    .select("*")
    .order("created_at", { ascending: true });

  if (eventsError) throw new Error(eventsError.message);
  if (!events || events.length === 0) return [];

  const { data: rows, error: rowsError } = await supabase
    .from("event_rows")
    .select("*")
    .in("event_id", events.map((e) => e.id))
    .order("row_number", { ascending: true });

  if (rowsError) throw new Error(rowsError.message);

  const rowsByEvent = new Map<string, EventRow[]>();
  for (const row of (rows ?? []) as EventRow[]) {
    const list = rowsByEvent.get(row.event_id) ?? [];
    list.push(row);
    rowsByEvent.set(row.event_id, list);
  }

  return (events as unknown as Record<string, unknown>[]).map((e) => {
    const eventId = e.id as string;
    const source = e.source as "luma" | "engage";
    const eventRows = rowsByEvent.get(eventId) ?? [];

    if (source === "luma") {
      return {
        id: eventId,
        details: {
          name: e.name as string,
          eventUrl: (e.event_url as string) ?? "",
          instagramUrl: (e.instagram_url as string) ?? "",
          startDate: (e.start_date as string) ?? "",
          endDate: (e.end_date as string) ?? "",
        },
        attendance: {
          fileName: e.file_name as string,
          fileSize: e.file_size as number,
          result: {
            source: "luma",
            data: {
              rows: eventRows.map((r) => ({
                rowNumber: r.row_number,
                attendee: r.email
                  ? {
                      email: r.email,
                      ...(r.display_name ? { name: r.display_name } : {}),
                      ...(r.check_in_time ? { checkInTime: r.check_in_time } : {}),
                      ...(r.checked_in ? { checkedIn: r.checked_in } : {}),
                      ...(r.approval_status ? { approvalStatus: r.approval_status } : {}),
                      ...(r.registration_status ? { registrationStatus: r.registration_status } : {}),
                      ...(r.ticket_type ? { ticketType: r.ticket_type } : {}),
                    }
                  : undefined,
                originalRow: r.original_row as Record<string, string | string[]>,
                issues: (r.issues as []) ?? [],
              })),
              fileIssues: [],
              detectedHeaders: (e.detected_headers as string[]) ?? [],
              validRowCount: e.valid_row_count as number,
              invalidRowCount: e.invalid_row_count as number,
            },
          },
        },
      } as SessionEventRecord;
    }

    // engage
    return {
      id: eventId,
      details: {
        name: e.name as string,
        eventUrl: (e.event_url as string) ?? "",
        instagramUrl: (e.instagram_url as string) ?? "",
        startDate: (e.start_date as string) ?? "",
        endDate: (e.end_date as string) ?? "",
      },
      attendance: {
        fileName: e.file_name as string,
        fileSize: e.file_size as number,
        result: {
          source: "engage",
          data: {
            metadata: {
              ...(e.name ? { name: e.name as string } : {}),
              ...((e.start_date as string) ? { startDate: e.start_date as string } : {}),
              ...((e.end_date as string) ? { endDate: e.end_date as string } : {}),
            },
            rows: eventRows.map((r) => ({
              rowNumber: r.row_number,
              attendee: {
                ...(r.email ? { email: r.email } : {}),
                ...(r.display_name ? { name: r.display_name } : {}),
                ...(r.campus_email ? { campusEmail: r.campus_email } : {}),
                ...(r.preferred_email ? { preferredEmail: r.preferred_email } : {}),
                ...(r.attendance_status ? { attendanceStatus: r.attendance_status } : {}),
              },
              originalRow: r.original_row as Record<string, string | string[]>,
              issues: (r.issues as []) ?? [],
            })),
            fileIssues: [],
            detectedHeaders: (e.detected_headers as string[]) ?? [],
            validRowCount: e.valid_row_count as number,
            invalidRowCount: e.invalid_row_count as number,
          },
        },
      },
    } as SessionEventRecord;
  });
}

export async function saveEventRecord(record: SessionEventRecord): Promise<void> {
  const payload = buildSavePayload(record);
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Supabase is not configured.");

  const { error } = await supabase.rpc("save_event_with_rows", payload);
  if (error) throw new Error(`Event could not be saved: ${error.message}`);
}

export async function deleteEventRecord(eventId: string): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Supabase is not configured.");
  const { error } = await supabase.from("events").delete().eq("id", eventId);
  if (error) throw new Error(error.message);
}

export async function clearEventRecords(): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Supabase is not configured.");
  // Deletes all events for the current project (RLS will scope). For now, delete where id is not null.
  const { error } = await supabase.from("events").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  if (error) throw new Error(error.message);
}
