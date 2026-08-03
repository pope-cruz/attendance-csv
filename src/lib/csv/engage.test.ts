import { describe, expect, it } from "vitest";

import { parseEngageCsv } from "./engage";

const ENGAGE_HEADER = [
  "First Name",
  "Last Name",
  "Campus Email",
  "Preferred Email",
  "Attendance Status",
  "Marked By",
  "Marked On",
  "Comments",
  "Card ID Number",
].join(",");

function csvWithRows(...rows: string[]): string {
  return [
    "Event Attendance By Event,,,,,,,,",
    ",,,,,,,,",
    "Community Demo Night,,,,,,,,",
    "Start Date,3/23/2026,,,,,,,",
    "End Date,3/23/2026,,,,,,,",
    ENGAGE_HEADER,
    ...rows,
  ].join("\n");
}

describe("parseEngageCsv", () => {
  it("finds the embedded header and parses event metadata and attendee fields", () => {
    const result = parseEngageCsv(
      csvWithRows(
        "Avery,Stone,  AVERY.STONE@NYU.EDU ,avery@example.com,Attended,Jordan Lee,3/23/2026 6:05 PM,Checked in,12345",
      ),
    );

    expect(result.fileIssues).toEqual([]);
    expect(result.metadata).toEqual({
      name: "Community Demo Night",
      startDate: "3/23/2026",
      endDate: "3/23/2026",
    });
    expect(result.detectedHeaders).toEqual(ENGAGE_HEADER.split(","));
    expect(result.validRowCount).toBe(1);
    expect(result.rows[0]).toMatchObject({
      rowNumber: 7,
      attendee: {
        email: "avery.stone@nyu.edu",
        name: "Avery Stone",
        firstName: "Avery",
        lastName: "Stone",
        campusEmail: "avery.stone@nyu.edu",
        preferredEmail: "avery@example.com",
        attendanceStatus: "Attended",
        markedBy: "Jordan Lee",
        markedOn: "3/23/2026 6:05 PM",
        comments: "Checked in",
        cardIdNumber: "12345",
      },
      issues: [],
    });
    expect(result.rows[0]?.originalRow["Campus Email"]).toBe(
      "  AVERY.STONE@NYU.EDU ",
    );
  });

  it("finds a shifted header and tolerates missing optional cells and blank rows", () => {
    const csv = [
      "Event Attendance By Event",
      "",
      "Extra export note",
      "",
      "Community Demo Night",
      "Start Date,3/23/2026",
      "End Date,3/23/2026",
      "",
      ENGAGE_HEADER,
      "Remy,Park,remy.park@nyu.edu,,Attended",
      "",
    ].join("\n");

    const result = parseEngageCsv(csv);

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.rowNumber).toBe(10);
    expect(result.rows[0]?.issues).toEqual([]);
    expect(result.rows[0]?.originalRow.Comments).toBe("");
  });

  it.each([
    {
      label: "Campus Email",
      campus: "casey@nyu.edu",
      preferred: "casey@example.com",
      expected: "casey@nyu.edu",
    },
    {
      label: "Preferred Email",
      campus: "casey@example.com",
      preferred: "CASEY@NYU.EDU",
      expected: "casey@nyu.edu",
    },
    {
      label: "matching source emails",
      campus: "CASEY@NYU.EDU",
      preferred: "casey@nyu.edu",
      expected: "casey@nyu.edu",
    },
  ])("selects the unique NYU identity from $label", ({ campus, preferred, expected }) => {
    const result = parseEngageCsv(
      csvWithRows(
        ["Casey", "Nguyen", campus, preferred, "Attended", "", "", "", ""].join(","),
      ),
    );

    expect(result.rows[0]?.attendee.email).toBe(expected);
    expect(result.rows[0]?.issues).toEqual([]);
  });

  it("keeps rows with no NYU email visible for review", () => {
    const result = parseEngageCsv(
      csvWithRows(
        "Morgan,Lee,morgan@example.com,morgan@personal.org,Attended,,,,",
      ),
    );

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.attendee.email).toBeUndefined();
    expect(result.rows[0]?.issues[0]?.code).toBe("missing_nyu_email");
    expect(result.invalidRowCount).toBe(1);
  });

  it("does not select between conflicting NYU emails", () => {
    const result = parseEngageCsv(
      csvWithRows(
        "Morgan,Lee,morgan.lee@nyu.edu,morgan.alt@nyu.edu,Attended,,,,",
      ),
    );

    expect(result.rows[0]?.attendee.email).toBeUndefined();
    expect(result.rows[0]?.issues[0]?.code).toBe("conflicting_nyu_emails");
  });

  it("reports malformed populated emails", () => {
    const result = parseEngageCsv(
      csvWithRows("Devon,Wu,not-an-email,,Attended,,,,"),
    );

    expect(result.rows[0]?.issues.map((issue) => issue.code)).toEqual([
      "invalid_email",
      "missing_nyu_email",
    ]);
  });

  it("flags every duplicate selected identity without merging rows", () => {
    const result = parseEngageCsv(
      csvWithRows(
        "Sam,Rivera,sam.rivera@nyu.edu,,Attended,,,,",
        "Samantha,Rivera,SAM.RIVERA@NYU.EDU,,Attended,,,,",
      ),
    );

    expect(result.rows).toHaveLength(2);
    expect(result.invalidRowCount).toBe(2);
    expect(
      result.rows.every((row) =>
        row.issues.some((issue) => issue.code === "duplicate_email"),
      ),
    ).toBe(true);
  });

  it("preserves extra cells and marks the row as malformed", () => {
    const result = parseEngageCsv(
      csvWithRows(
        "Taylor,Quinn,taylor.quinn@nyu.edu,,Attended,,,,,unexpected value",
      ),
    );

    expect(result.rows[0]?.originalRow.__parsed_extra).toEqual([
      "unexpected value",
    ]);
    expect(result.rows[0]?.issues[0]?.code).toBe("malformed_csv");
  });

  it("reports empty files and files without an Engage header", () => {
    const empty = parseEngageCsv(" \n");
    const missingHeader = parseEngageCsv(
      "Name,Email\nAvery Stone,avery@nyu.edu",
    );

    expect(empty.fileIssues[0]?.code).toBe("empty_file");
    expect(missingHeader.fileIssues.at(-1)?.code).toBe(
      "missing_engage_header",
    );
  });
});
