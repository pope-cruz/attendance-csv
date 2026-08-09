import type {
  EventAttendanceImport,
  EventDetails,
  SessionEventRecord,
} from "@/types/event";

export type CreateEventRecordResult =
  | { ok: true; record: SessionEventRecord }
  | { ok: false; message: string };

export type UpdateEventRecordDetailsResult =
  | { ok: true; record: SessionEventRecord }
  | { ok: false; message: string };

export function createEventRecord(
  id: string,
  details: EventDetails,
  attendance: EventAttendanceImport | null,
): CreateEventRecordResult {
  const eventName = details.name.trim();

  if (!eventName) {
    return {
      ok: false,
      message: "Add an event name before adding this event to the session.",
    };
  }

  if (!attendance) {
    return {
      ok: false,
      message: "Choose an attendance CSV before adding this event to the session.",
    };
  }

  if (attendance.result.source === "unknown") {
    return {
      ok: false,
      message:
        "Use a CSV recognized as Luma or NYU Engage before adding this event to the session.",
    };
  }

  return {
    ok: true,
    record: {
      id,
      details: {
        ...details,
        name: eventName,
      },
      attendance,
    },
  };
}

export function updateEventRecordDetails(
  record: SessionEventRecord,
  details: EventDetails,
): UpdateEventRecordDetailsResult {
  const eventName = details.name.trim();

  if (!eventName) {
    return {
      ok: false,
      message: "Add an event name before saving changes.",
    };
  }

  return {
    ok: true,
    record: {
      ...record,
      details: {
        ...details,
        name: eventName,
      },
    },
  };
}
