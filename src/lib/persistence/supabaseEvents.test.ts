import { beforeEach, describe, expect, it, vi } from "vitest";

import type { SessionEventRecord } from "@/types/event";

const supabaseMocks = vi.hoisted(() => ({
  from: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("@/lib/supabase/client", () => ({
  getSupabaseClient: () => ({
    from: supabaseMocks.from,
    rpc: supabaseMocks.rpc,
  }),
}));

import {
  loadEventRecords,
  resolveEventRow,
  saveEventRecord,
  updateEventDetails,
} from "./supabaseEvents";

const LUMA_EVENT_ID = "11111111-1111-4111-8111-111111111111";
const ENGAGE_EVENT_ID = "22222222-2222-4222-8222-222222222222";

type SavedPayload = {
  event_payload: Record<string, unknown>;
  rows_payload: Record<string, unknown>[];
};

function capturedSavePayload(): SavedPayload {
  const payload = supabaseMocks.rpc.mock.calls[0]?.[1] as
    | SavedPayload
    | undefined;

  if (!payload) {
    throw new Error("Expected saveEventRecord to send an RPC payload.");
  }

  return payload;
}

function mockLoadQueries(
  events: Record<string, unknown>[],
  rows: Record<string, unknown>[],
): void {
  const eventsOrder = vi.fn().mockResolvedValue({ data: events, error: null });
  const rowsOrder = vi.fn().mockResolvedValue({ data: rows, error: null });
  const rowsIn = vi.fn(() => ({ order: rowsOrder }));

  supabaseMocks.from.mockImplementation((table: string) => {
    if (table === "events") {
      return {
        select: vi.fn(() => ({ order: eventsOrder })),
      };
    }

    if (table === "event_rows") {
      return {
        select: vi.fn(() => ({ in: rowsIn })),
      };
    }

    throw new Error(`Unexpected fake Supabase table: ${table}`);
  });
}

async function roundTripRecord(
  record: SessionEventRecord,
): Promise<SessionEventRecord> {
  await saveEventRecord(record);
  const payload = capturedSavePayload();

  mockLoadQueries(
    [{ ...payload.event_payload, created_at: "2026-08-07T00:00:00Z" }],
    payload.rows_payload,
  );

  const loadedRecords = await loadEventRecords();
  const loadedRecord = loadedRecords[0];

  if (!loadedRecord) {
    throw new Error("Expected the fake Supabase queries to load one event.");
  }

  return loadedRecord;
}

function lumaRecord(): SessionEventRecord {
  return {
    id: LUMA_EVENT_ID,
    details: {
      name: "Fake Luma Event",
      eventUrl: "https://example.com/luma-event",
      instagramUrl: "",
      startDate: "2026-08-01",
      endDate: "2026-08-01",
    },
    attendance: {
      fileName: "fake-luma.csv",
      fileSize: 512,
      result: {
        source: "luma",
        data: {
          rows: [
            {
              rowNumber: 2,
              attendee: {
                email: "alex@example.com",
                name: "Alex Example",
                checkInTime: "2026-08-01 18:05",
                approvalStatus: "approved",
                registrationStatus: "registered",
                ticketType: "Member",
              },
              originalRow: {
                Email: "Alex@Example.com",
                "Check-in Time": "2026-08-01 18:05",
              },
              issues: [],
            },
            {
              rowNumber: 3,
              attendee: {
                email: "blair@example.com",
                name: "Blair Example",
                checkedIn: "No",
              },
              originalRow: {
                Email: "blair@example.com",
                "Checked In": "No",
              },
              issues: [
                {
                  code: "malformed_csv",
                  severity: "error",
                  message: "Fake malformed row",
                  rowNumber: 3,
                },
              ],
            },
          ],
          fileIssues: [
            {
              code: "malformed_csv",
              severity: "error",
              message: "Fake Luma file parsing issue",
            },
          ],
          detectedHeaders: ["Email", "Check-in Time", "Checked In"],
          validRowCount: 1,
          invalidRowCount: 1,
        },
      },
    },
  };
}

function engageRecord(): SessionEventRecord {
  return {
    id: ENGAGE_EVENT_ID,
    details: {
      name: "Fake Engage Event",
      eventUrl: "",
      instagramUrl: "https://example.com/post",
      startDate: "2026-08-02",
      endDate: "2026-08-02",
    },
    attendance: {
      fileName: "fake-engage.csv",
      fileSize: 768,
      result: {
        source: "engage",
        data: {
          metadata: {
            name: "Fake Engage Event",
            startDate: "2026-08-02",
            endDate: "2026-08-02",
          },
          rows: [
            {
              rowNumber: 7,
              attendee: {
                email: "casey@nyu.edu",
                name: "Casey Example",
                campusEmail: "casey@nyu.edu",
                preferredEmail: "casey@example.com",
                attendanceStatus: "Attended",
              },
              originalRow: {
                "Campus Email": "CASEY@NYU.EDU",
                "Attendance Status": "Attended",
              },
              issues: [],
            },
          ],
          fileIssues: [
            {
              code: "malformed_csv",
              severity: "error",
              message: "Fake Engage file parsing issue",
            },
          ],
          detectedHeaders: ["Campus Email", "Attendance Status"],
          validRowCount: 1,
          invalidRowCount: 0,
        },
      },
    },
  };
}

function unknownRecord(): SessionEventRecord {
  return {
    id: "33333333-3333-4333-8333-333333333333",
    details: {
      name: "Unknown Import",
      eventUrl: "",
      instagramUrl: "",
      startDate: "",
      endDate: "",
    },
    attendance: {
      fileName: "unknown.csv",
      fileSize: 32,
      result: {
        source: "unknown",
        data: {
          rows: [],
          fileIssues: [],
          detectedHeaders: [],
          validRowCount: 0,
          invalidRowCount: 0,
        },
      },
    },
  };
}

beforeEach(() => {
  supabaseMocks.from.mockReset();
  supabaseMocks.rpc.mockReset();
  supabaseMocks.rpc.mockResolvedValue({ error: null });
});

describe("saveEventRecord", () => {
  it("saves a Luma event and all source rows with one RPC call", async () => {
    await saveEventRecord(lumaRecord());

    expect(supabaseMocks.rpc).toHaveBeenCalledTimes(1);
    expect(supabaseMocks.from).not.toHaveBeenCalled();
    expect(supabaseMocks.rpc).toHaveBeenCalledWith("save_event_with_rows", {
      event_payload: {
        id: LUMA_EVENT_ID,
        name: "Fake Luma Event",
        event_url: "https://example.com/luma-event",
        instagram_url: null,
        start_date: "2026-08-01",
        end_date: "2026-08-01",
        file_name: "fake-luma.csv",
        file_size: 512,
        source: "luma",
        detected_headers: ["Email", "Check-in Time", "Checked In"],
        valid_row_count: 1,
        invalid_row_count: 1,
        file_issues: [
          {
            code: "malformed_csv",
            severity: "error",
            message: "Fake Luma file parsing issue",
          },
        ],
      },
      rows_payload: [
        expect.objectContaining({
          event_id: LUMA_EVENT_ID,
          row_number: 2,
          email: "alex@example.com",
          check_in_time: "2026-08-01 18:05",
          attended: true,
          original_row: {
            Email: "Alex@Example.com",
            "Check-in Time": "2026-08-01 18:05",
          },
          issues: [],
        }),
        expect.objectContaining({
          event_id: LUMA_EVENT_ID,
          row_number: 3,
          checked_in: "No",
          attended: false,
          issues: [
            expect.objectContaining({
              code: "malformed_csv",
              rowNumber: 3,
            }),
          ],
        }),
      ],
    });
  });

  it("maps Engage-specific fields into the same atomic RPC", async () => {
    await saveEventRecord(engageRecord());

    expect(supabaseMocks.rpc).toHaveBeenCalledTimes(1);
    const [, payload] = supabaseMocks.rpc.mock.calls[0] ?? [];
    expect(payload).toMatchObject({
      event_payload: {
        id: ENGAGE_EVENT_ID,
        source: "engage",
        instagram_url: "https://example.com/post",
        file_issues: [
          {
            code: "malformed_csv",
            severity: "error",
            message: "Fake Engage file parsing issue",
          },
        ],
      },
      rows_payload: [
        {
          event_id: ENGAGE_EVENT_ID,
          row_number: 7,
          email: "casey@nyu.edu",
          display_email: "casey@nyu.edu",
          display_name: "Casey Example",
          source: "engage",
          check_in_time: null,
          checked_in: null,
          approval_status: null,
          registration_status: null,
          ticket_type: null,
          campus_email: "casey@nyu.edu",
          preferred_email: "casey@example.com",
          attendance_status: "Attended",
          attended: true,
          rsvp_label: "Attended",
          original_row: {
            "Campus Email": "CASEY@NYU.EDU",
            "Attendance Status": "Attended",
          },
          issues: [],
        },
      ],
    });
  });

  it("rejects an unknown source before calling Supabase", async () => {
    await expect(saveEventRecord(unknownRecord())).rejects.toThrow(
      "Cannot save an unrecognized attendance source.",
    );

    expect(supabaseMocks.rpc).not.toHaveBeenCalled();
    expect(supabaseMocks.from).not.toHaveBeenCalled();
  });

  it("reports an RPC failure without logging attendee payloads", async () => {
    supabaseMocks.rpc.mockResolvedValue({
      error: { message: "Fake database failure" },
    });

    await expect(saveEventRecord(lumaRecord())).rejects.toThrow(
      "Event could not be saved: Fake database failure",
    );
  });
});

describe("loadEventRecords", () => {
  it("round-trips a Luma event without losing validation or source data", async () => {
    const record = lumaRecord();

    await expect(roundTripRecord(record)).resolves.toEqual(record);
  });

  it("round-trips an Engage event without losing validation or source data", async () => {
    const record = engageRecord();

    await expect(roundTripRecord(record)).resolves.toEqual(record);
  });

  it("uses an empty file issue list for a legacy event without stored issues", async () => {
    const record = lumaRecord();
    await saveEventRecord(record);
    const payload = capturedSavePayload();

    mockLoadQueries(
      [
        {
          ...payload.event_payload,
          file_issues: null,
          created_at: "2026-08-07T00:00:00Z",
        },
      ],
      payload.rows_payload,
    );

    const loadedRecords = await loadEventRecords();

    expect(loadedRecords[0]?.attendance.result.data.fileIssues).toEqual([]);
  });

  it("loads row resolution metadata without replacing source values", async () => {
    const record = lumaRecord();
    await saveEventRecord(record);
    const payload = capturedSavePayload();
    const sourceRow = payload.rows_payload[1];
    if (!sourceRow) throw new Error("Expected a fake invalid row.");

    mockLoadQueries(
      [{ ...payload.event_payload, created_at: "2026-08-07T00:00:00Z" }],
      [{ ...payload.rows_payload[0] }, {
        ...sourceRow,
        resolution_status: "corrected",
        corrected_email: "blair-fixed@example.com",
        corrected_name: "Blair Fixed",
        resolution_note: "Confirmed against the organizer roster.",
        resolver_label: "PC",
        resolved_by: "44444444-4444-4444-8444-444444444444",
        resolved_at: "2026-08-13T12:00:00Z",
      }],
    );

    const loaded = await loadEventRecords();
    const loadedRow = loaded[0]?.attendance.result.data.rows[1];
    expect(loadedRow?.originalRow).toEqual(sourceRow.original_row);
    expect(loadedRow?.issues).toEqual(sourceRow.issues);
    expect(loadedRow?.resolution).toEqual({
      status: "corrected",
      email: "blair-fixed@example.com",
      name: "Blair Fixed",
      note: "Confirmed against the organizer roster.",
      resolverLabel: "PC",
      resolvedBy: "44444444-4444-4444-8444-444444444444",
      resolvedAt: "2026-08-13T12:00:00Z",
    });
  });
});

describe("updateEventDetails", () => {
  it("updates only event metadata without invoking row replacement", async () => {
    const eq = vi.fn().mockResolvedValue({ error: null });
    const update = vi.fn(() => ({ eq }));
    supabaseMocks.from.mockReturnValue({ update });

    await updateEventDetails(LUMA_EVENT_ID, lumaRecord().details);

    expect(supabaseMocks.rpc).not.toHaveBeenCalled();
    expect(supabaseMocks.from).toHaveBeenCalledWith("events");
    expect(update).toHaveBeenCalledWith({
      name: "Fake Luma Event",
      event_url: "https://example.com/luma-event",
      instagram_url: null,
      start_date: "2026-08-01",
      end_date: "2026-08-01",
    });
    expect(eq).toHaveBeenCalledWith("id", LUMA_EVENT_ID);
  });
});

describe("resolveEventRow", () => {
  it("normalizes correction input and returns server audit metadata", async () => {
    supabaseMocks.rpc.mockResolvedValue({
      data: {
        resolution_status: "corrected",
        corrected_email: "fixed@nyu.edu",
        corrected_name: "Fixed Person",
        resolution_note: "Checked the roster.",
        resolver_label: "PC",
        resolved_by: "44444444-4444-4444-8444-444444444444",
        resolved_at: "2026-08-13T12:00:00Z",
      },
      error: null,
    });

    await expect(resolveEventRow({
      eventId: ENGAGE_EVENT_ID,
      rowNumber: 7,
      source: "engage",
      status: "corrected",
      email: " FIXED@NYU.EDU ",
      name: " Fixed Person ",
      note: " Checked the roster. ",
      resolverLabel: " PC ",
    })).resolves.toEqual({
      status: "corrected",
      email: "fixed@nyu.edu",
      name: "Fixed Person",
      note: "Checked the roster.",
      resolverLabel: "PC",
      resolvedBy: "44444444-4444-4444-8444-444444444444",
      resolvedAt: "2026-08-13T12:00:00Z",
    });

    expect(supabaseMocks.rpc).toHaveBeenCalledWith("resolve_event_row", {
      event_id_value: ENGAGE_EVENT_ID,
      row_number_value: 7,
      resolution_status_value: "corrected",
      corrected_email_value: "fixed@nyu.edu",
      corrected_name_value: "Fixed Person",
      resolution_note_value: "Checked the roster.",
      resolver_label_value: "PC",
    });
  });

  it("sends null identity fields when excluding a row", async () => {
    supabaseMocks.rpc.mockResolvedValue({
      data: {
        resolution_status: "excluded",
        corrected_email: null,
        corrected_name: null,
        resolution_note: "Duplicate registration.",
        resolver_label: "PC",
        resolved_by: null,
        resolved_at: "2026-08-13T12:00:00Z",
      },
      error: null,
    });

    await resolveEventRow({
      eventId: LUMA_EVENT_ID,
      rowNumber: 3,
      source: "luma",
      status: "excluded",
      note: "Duplicate registration.",
      resolverLabel: "PC",
    });

    expect(supabaseMocks.rpc).toHaveBeenCalledWith("resolve_event_row", expect.objectContaining({
      corrected_email_value: null,
      corrected_name_value: null,
    }));
  });
});
