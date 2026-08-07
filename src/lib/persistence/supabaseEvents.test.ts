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

import { saveEventRecord } from "./supabaseEvents";

const LUMA_EVENT_ID = "11111111-1111-4111-8111-111111111111";
const ENGAGE_EVENT_ID = "22222222-2222-4222-8222-222222222222";

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
          fileIssues: [],
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
          fileIssues: [],
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

describe("saveEventRecord", () => {
  beforeEach(() => {
    supabaseMocks.from.mockReset();
    supabaseMocks.rpc.mockReset();
    supabaseMocks.rpc.mockResolvedValue({ error: null });
  });

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
