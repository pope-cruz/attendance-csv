import { EMAIL_PATTERN, isNyuEmail, normalizeEmail } from "@/lib/matching/normalize";
import type { CsvSource, ImportIssue, RowResolution } from "@/types/import";

export interface EffectiveIdentity {
  email: string;
  name?: string;
}

export function hasErrorIssues(issues: ImportIssue[]): boolean {
  return issues.some((issue) => issue.severity === "error");
}

export function effectiveIdentity(
  importedEmail: string | undefined,
  importedName: string | undefined,
  issues: ImportIssue[],
  resolution?: RowResolution,
): EffectiveIdentity | null {
  if (resolution?.status === "excluded") {
    return null;
  }

  if (resolution?.status === "corrected") {
    const email = normalizeEmail(resolution.email);
    return email
      ? {
          email,
          ...(resolution.name?.trim() ? { name: resolution.name.trim() } : {}),
        }
      : null;
  }

  if (hasErrorIssues(issues)) {
    return null;
  }

  const email = normalizeEmail(importedEmail ?? "");
  return email
    ? {
        email,
        ...(importedName?.trim() ? { name: importedName.trim() } : {}),
      }
    : null;
}

export function correctionEmailError(
  source: CsvSource,
  emailValue: string,
): string | null {
  const email = normalizeEmail(emailValue);
  if (!email || !EMAIL_PATTERN.test(email)) {
    return "Enter a valid email address.";
  }
  if (source === "engage" && !isNyuEmail(email)) {
    return "NYU Engage rows must use an @nyu.edu email address.";
  }
  return null;
}
