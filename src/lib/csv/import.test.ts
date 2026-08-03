import { describe, expect, it } from "vitest";

import { detectCsvSource, parseAttendanceCsv } from "./import";

const engageCsv = [
  "Event Attendance By Event,,,,",
  "Community Demo Night,,,,",
  "Start Date,3/23/2026,,,",
  "End Date,3/23/2026,,,",
  "First Name,Last Name,Campus Email,Preferred Email,Attendance Status",
  "Avery,Stone,avery.stone@nyu.edu,,Attended",
].join("\n");

describe("detectCsvSource", () => {
  it("detects a Luma CSV from its header aliases", () => {
    expect(
      detectCsvSource(
        "Name,Email,Registration Status\nAvery Stone,avery@example.com,registered",
      ),
    ).toEqual({ source: "luma" });
  });

  it("detects an Engage CSV even when its header follows a preamble", () => {
    expect(detectCsvSource(engageCsv)).toEqual({ source: "engage" });
  });

  it("returns unknown for empty, unrecognized, and ambiguous files", () => {
    expect(detectCsvSource(" \n")).toEqual({
      source: "unknown",
      reason: "empty",
    });
    expect(detectCsvSource("Product,Quantity\nBadges,12")).toEqual({
      source: "unknown",
      reason: "unrecognized",
    });
    expect(
      detectCsvSource(
        "Name,Email,Campus Email,Preferred Email,Attendance Status",
      ),
    ).toEqual({ source: "unknown", reason: "ambiguous" });
  });
});

describe("parseAttendanceCsv", () => {
  it("dispatches detected files to their source parser", () => {
    const engage = parseAttendanceCsv(engageCsv);
    const luma = parseAttendanceCsv(
      "Name,Email\nAvery Stone,avery@example.com",
    );

    expect(engage.source).toBe("engage");
    expect(engage.data.validRowCount).toBe(1);
    expect(luma.source).toBe("luma");
    expect(luma.data.validRowCount).toBe(1);
  });

  it("returns an actionable file issue when detection is unsafe", () => {
    const unknown = parseAttendanceCsv("Product,Quantity\nBadges,12");
    const ambiguous = parseAttendanceCsv(
      "Name,Email,Campus Email,Preferred Email,Attendance Status",
    );

    expect(unknown.source).toBe("unknown");
    expect(unknown.data.fileIssues[0]?.code).toBe("unknown_csv_source");
    expect(ambiguous.data.fileIssues[0]?.code).toBe(
      "ambiguous_csv_source",
    );
  });
});
