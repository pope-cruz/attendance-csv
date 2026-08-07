import { describe, expect, it } from "vitest";

import {
  EMAIL_PATTERN,
  isNyuEmail,
  isValidEmail,
  normalizeEmail,
  normalizeHeader,
} from "./normalize";

describe("normalizeHeader", () => {
  it("trims, lowercases, and collapses whitespace", () => {
    expect(normalizeHeader("  Campus   Email ")).toBe("campus email");
  });

  it("converts underscores and dashes to spaces", () => {
    expect(normalizeHeader("campus_email")).toBe("campus email");
    expect(normalizeHeader("campus-email")).toBe("campus email");
    expect(normalizeHeader("check_in-time")).toBe("check in time");
  });

  it("strips BOM and handles mixed separators", () => {
    expect(normalizeHeader("\uFEFF Guest_Email ")).toBe("guest email");
  });
});

describe("normalizeEmail", () => {
  it("trims and lowercases", () => {
    expect(normalizeEmail("  Alex@NYU.EDU ")).toBe("alex@nyu.edu");
    expect(normalizeEmail("TEST@Example.COM")).toBe("test@example.com");
  });
});

describe("isValidEmail", () => {
  it("validates against EMAIL_PATTERN", () => {
    expect(isValidEmail("alex@nyu.edu")).toBe(true);
    expect(isValidEmail("ALEX@NYU.EDU")).toBe(true); // EMAIL_PATTERN is case-insensitive for local pattern, normalize for NYU check
    expect(isValidEmail("alex@nyu")).toBe(false);
    expect(isValidEmail("alex @nyu.edu")).toBe(false);
    expect(isValidEmail("")).toBe(false);
  });

  it("matches EMAIL_PATTERN directly", () => {
    expect(EMAIL_PATTERN.test("a@b.c")).toBe(true);
    expect(EMAIL_PATTERN.test("a@b")).toBe(false);
  });
});

describe("isNyuEmail", () => {
  it("accepts only @nyu.edu after validation", () => {
    expect(isNyuEmail("alex@nyu.edu")).toBe(true);
    expect(isNyuEmail("alex@example.com")).toBe(false);
    expect(isNyuEmail("alex@nyu.edu ")).toBe(false); // not trimmed — normalize first
    expect(isNyuEmail("")).toBe(false);
    expect(isNyuEmail("alex@NYU.EDU")).toBe(false); // case sensitive — normalize first
  });

  it("works on normalized emails", () => {
    expect(isNyuEmail(normalizeEmail("  Alex@NYU.EDU "))).toBe(true);
  });
});
