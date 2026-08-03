import { describe, expect, it } from "vitest";

import { parseLumaCsv } from "./luma";

describe("parseLumaCsv", () => {
  it("parses a Luma export and normalizes email identity", () => {
    const csv = [
      "Name,Email,Approval Status,Registration Status,Check-in Time,Ticket Type",
      '"Avery Stone",  AVERY.STONE@EXAMPLE.COM ,approved,registered,2026-07-20 18:05,Member',
    ].join("\n");

    const result = parseLumaCsv(csv);

    expect(result.fileIssues).toEqual([]);
    expect(result.validRowCount).toBe(1);
    expect(result.rows[0]?.attendee).toEqual({
      email: "avery.stone@example.com",
      name: "Avery Stone",
      approvalStatus: "approved",
      registrationStatus: "registered",
      checkInTime: "2026-07-20 18:05",
      ticketType: "Member",
    });
    expect(result.rows[0]?.originalRow.Email).toBe(
      "  AVERY.STONE@EXAMPLE.COM ",
    );
  });

  it("accepts header aliases, optional blanks, and extra columns", () => {
    const csv = [
      "Guest First Name,Guest Last Name,\uFEFFGuest_Email,Company,Notes",
      "Remy,Park,remy.park@example.org,Northstar Labs,",
    ].join("\n");

    const result = parseLumaCsv(csv);

    expect(result.validRowCount).toBe(1);
    expect(result.rows[0]?.attendee).toEqual({
      email: "remy.park@example.org",
      name: "Remy Park",
    });
    expect(result.rows[0]?.originalRow.Company).toBe("Northstar Labs");
  });

  it("reports an empty file", () => {
    const result = parseLumaCsv("  \n");

    expect(result.fileIssues[0]?.code).toBe("empty_file");
    expect(result.rows).toEqual([]);
  });

  it("reports a missing email header without discarding source rows", () => {
    const result = parseLumaCsv("Name,Company\nTaylor Quinn,Signal House");

    expect(result.fileIssues[0]?.code).toBe("missing_email_header");
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.originalRow).toEqual({
      Name: "Taylor Quinn",
      Company: "Signal House",
    });
  });

  it.each([
    ["missing", "Name,Email\nMorgan Lee,"],
    ["invalid", "Name,Email\nMorgan Lee,not-an-email"],
  ])("marks a row with a %s email for review", (_, csv) => {
    const result = parseLumaCsv(csv);

    expect(result.validRowCount).toBe(0);
    expect(result.invalidRowCount).toBe(1);
    expect(result.rows[0]?.issues).toHaveLength(1);
    expect(result.rows[0]?.originalRow.Name).toBe("Morgan Lee");
  });

  it("flags every duplicate email row instead of merging people", () => {
    const csv = [
      "Name,Email",
      "Sam Rivera,sam.rivera@example.com",
      "Samantha Rivera,SAM.RIVERA@example.com",
    ].join("\n");

    const result = parseLumaCsv(csv);

    expect(result.invalidRowCount).toBe(2);
    expect(result.rows.every((row) => row.issues[0]?.code === "duplicate_email"))
      .toBe(true);
  });

  it("keeps a malformed row visible with a parsing issue", () => {
    const csv = [
      "Name,Email",
      "Devon Wu,devon.wu@example.com,unexpected value",
    ].join("\n");

    const result = parseLumaCsv(csv);

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.issues[0]?.code).toBe("malformed_csv");
    expect(result.rows[0]?.originalRow.__parsed_extra).toEqual([
      "unexpected value",
    ]);
  });

  it("ignores fully blank lines", () => {
    const result = parseLumaCsv(
      "Name,Email\n\nCasey Nguyen,casey.nguyen@example.com\n  ,  \n",
    );

    expect(result.rows).toHaveLength(1);
    expect(result.validRowCount).toBe(1);
  });
});
