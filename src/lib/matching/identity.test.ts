import { describe, expect, it } from "vitest";

import type { ImportIssue, RowResolution } from "@/types/import";

import {
  correctionEmailError,
  effectiveIdentity,
  hasErrorIssues,
} from "./identity";

const errorIssue: ImportIssue = {
  code: "invalid_email",
  severity: "error",
  message: "Fake invalid email.",
  rowNumber: 2,
};

const audit = {
  note: "Confirmed against the organizer roster.",
  resolverLabel: "PC",
  resolvedBy: "11111111-1111-4111-8111-111111111111",
  resolvedAt: "2026-08-13T12:00:00Z",
};

describe("effectiveIdentity", () => {
  it("uses imported identity for a clean or warning-only row", () => {
    expect(effectiveIdentity(" ALEX@example.com ", " Alex ", [], undefined)).toEqual({
      email: "alex@example.com",
      name: "Alex",
    });
    expect(
      effectiveIdentity("alex@example.com", "Alex", [{ ...errorIssue, severity: "warning" }]),
    ).toEqual({ email: "alex@example.com", name: "Alex" });
  });

  it("hides unresolved and excluded rows", () => {
    expect(effectiveIdentity("broken", "Alex", [errorIssue])).toBeNull();
    const resolution: RowResolution = { status: "excluded", ...audit };
    expect(effectiveIdentity("alex@example.com", "Alex", [errorIssue], resolution)).toBeNull();
  });

  it("uses a corrected identity while retaining import issues", () => {
    const resolution: RowResolution = {
      status: "corrected",
      email: " ALEX@NYU.EDU ",
      name: "Alexander Example",
      ...audit,
    };
    expect(effectiveIdentity("broken", "Alex", [errorIssue], resolution)).toEqual({
      email: "alex@nyu.edu",
      name: "Alexander Example",
    });
  });
});

describe("correctionEmailError", () => {
  it("accepts general Luma emails and requires NYU email for Engage", () => {
    expect(correctionEmailError("luma", "person@example.com")).toBeNull();
    expect(correctionEmailError("engage", "person@example.com")).toContain("@nyu.edu");
    expect(correctionEmailError("engage", "person@nyu.edu")).toBeNull();
    expect(correctionEmailError("luma", "not-an-email")).toBe("Enter a valid email address.");
  });
});

describe("hasErrorIssues", () => {
  it("ignores warning-only issues", () => {
    expect(hasErrorIssues([{ ...errorIssue, severity: "warning" }])).toBe(false);
    expect(hasErrorIssues([errorIssue])).toBe(true);
  });
});
