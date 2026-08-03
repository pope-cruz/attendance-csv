import { describe, expect, it } from "vitest";

import type { AttendanceImportResult } from "@/types/import";

import { EMPTY_EVENT_DETAILS, fillEventDetailsFromImport } from "./details";

describe("fillEventDetailsFromImport", () => {
  it("fills empty event fields from Engage metadata", () => {
    const result: AttendanceImportResult = {
      source: "engage",
      data: {
        metadata: {
          name: "Community Demo Night",
          startDate: "3/23/2026",
          endDate: "3/23/2026",
        },
        rows: [],
        fileIssues: [],
        detectedHeaders: [],
        validRowCount: 0,
        invalidRowCount: 0,
      },
    };

    expect(fillEventDetailsFromImport(EMPTY_EVENT_DETAILS, result)).toEqual({
      ...EMPTY_EVENT_DETAILS,
      name: "Community Demo Night",
      startDate: "3/23/2026",
      endDate: "3/23/2026",
    });
  });

  it("does not overwrite details entered by an operator", () => {
    const currentDetails = {
      ...EMPTY_EVENT_DETAILS,
      name: "Edited event name",
      startDate: "March 24, 2026",
    };
    const result: AttendanceImportResult = {
      source: "engage",
      data: {
        metadata: {
          name: "Exported event name",
          startDate: "3/23/2026",
        },
        rows: [],
        fileIssues: [],
        detectedHeaders: [],
        validRowCount: 0,
        invalidRowCount: 0,
      },
    };

    expect(fillEventDetailsFromImport(currentDetails, result)).toMatchObject({
      name: "Edited event name",
      startDate: "March 24, 2026",
    });
  });

  it("leaves event details unchanged for Luma imports", () => {
    const currentDetails = {
      ...EMPTY_EVENT_DETAILS,
      name: "Luma event",
    };
    const result: AttendanceImportResult = {
      source: "luma",
      data: {
        rows: [],
        fileIssues: [],
        detectedHeaders: [],
        validRowCount: 0,
        invalidRowCount: 0,
      },
    };

    expect(fillEventDetailsFromImport(currentDetails, result)).toBe(
      currentDetails,
    );
  });
});
