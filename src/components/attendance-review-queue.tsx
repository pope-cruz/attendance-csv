"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { correctionEmailError, effectiveIdentity } from "@/lib/matching/identity";
import { loadEventRecords, resolveEventRow } from "@/lib/persistence";
import {
  REVIEW_PAGE_SIZE,
  applyRowResolution,
  buildReviewQueue,
  filterReviewQueue,
  paginateReviewQueue,
  reviewQueueStats,
  type ReviewQueueRow,
  type ReviewView,
} from "@/lib/review/queue";
import type { SessionEventRecord } from "@/types/event";
import type { ImportIssueCode, RowResolution } from "@/types/import";

const ISSUE_OPTIONS: { code: ImportIssueCode; label: string }[] = [
  { code: "missing_email_header", label: "Missing email column" },
  { code: "missing_email", label: "Missing email" },
  { code: "missing_nyu_email", label: "Missing NYU email" },
  { code: "conflicting_nyu_emails", label: "Conflicting NYU emails" },
  { code: "invalid_email", label: "Invalid email" },
  { code: "duplicate_email", label: "Duplicate email" },
  { code: "malformed_csv", label: "Malformed CSV row" },
];

interface ResolutionDraft {
  status: RowResolution["status"];
  email: string;
  name: string;
  note: string;
}

function initialDraft(row: ReviewQueueRow): ResolutionDraft {
  return {
    status: row.resolution?.status ?? "corrected",
    email:
      row.resolution?.status === "corrected"
        ? row.resolution.email
        : row.importedEmail ?? "",
    name:
      row.resolution?.status === "corrected"
        ? row.resolution.name ?? ""
        : row.importedName ?? "",
    note: row.resolution?.note ?? "",
  };
}

function formatResolutionDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function sourceLabel(source: ReviewQueueRow["source"]): string {
  return source === "luma" ? "Luma" : "NYU Engage";
}

function ReviewItem({
  operatorLabel,
  row,
  onResolved,
}: {
  operatorLabel: string;
  row: ReviewQueueRow;
  onResolved: (row: ReviewQueueRow, resolution: RowResolution) => void;
}) {
  const [isEditing, setIsEditing] = useState(!row.resolution);
  const [isExpanded, setIsExpanded] = useState(false);
  const [draft, setDraft] = useState(() => initialDraft(row));
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const identity = effectiveIdentity(
    row.importedEmail,
    row.importedName,
    row.issues,
    row.resolution,
  );

  async function save(): Promise<void> {
    const resolverLabel = operatorLabel.trim();
    const note = draft.note.trim();
    if (!resolverLabel) {
      setError("Add your name or initials at the top of the queue before saving.");
      return;
    }
    if (!note) {
      setError("Add a note explaining how this row was resolved.");
      return;
    }
    if (draft.status === "corrected") {
      const emailError = correctionEmailError(row.source, draft.email);
      if (emailError) {
        setError(emailError);
        return;
      }
    }

    setIsSaving(true);
    setError(null);
    try {
      const resolution = await resolveEventRow({
        eventId: row.eventId,
        rowNumber: row.rowNumber,
        source: row.source,
        status: draft.status,
        ...(draft.status === "corrected"
          ? { email: draft.email, name: draft.name }
          : {}),
        note,
        resolverLabel,
      });
      onResolved(row, resolution);
      setIsEditing(false);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Row could not be resolved. Try again.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <li className="border-b border-[var(--border)] last:border-b-0">
      <div className="grid gap-3 px-4 py-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold text-[var(--ink)]">{row.eventName}</h3>
            <span className="rounded-md bg-[var(--subtle)] px-2 py-1 text-xs text-[var(--slate)]">
              {sourceLabel(row.source)} · row {row.rowNumber}
            </span>
            {row.attended && (
              <span className="rounded-md bg-[var(--success-bg)] px-2 py-1 text-xs font-semibold text-[var(--success-text)]">
                Attended
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-[var(--muted)]">
            {row.eventDate} · {row.importedName || "Name unavailable"} · {row.importedEmail || "Email unavailable"}
          </p>
          <p className="mt-1 text-xs font-medium text-[var(--slate)]">
            Attendance signal: {row.attendanceDetail}
          </p>
          <ul className="mt-3 grid gap-1 text-sm text-[var(--error-text)]">
            {row.issues.map((issue, index) => (
              <li key={`${issue.code}-${index}`}>{issue.message}</li>
            ))}
          </ul>
        </div>
        <button
          className="min-h-10 rounded-md border border-[var(--border-strong)] bg-white px-3 py-2 text-xs font-semibold hover:bg-[var(--subtle)]"
          onClick={() => setIsExpanded((current) => !current)}
          type="button"
          aria-expanded={isExpanded}
        >
          {isExpanded ? "Hide source row" : "View source row"}
        </button>
      </div>

      {isExpanded && (
        <div className="border-t border-[var(--border)] bg-[var(--subtle)] px-4 py-4">
          <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
            {Object.entries(row.originalRow).map(([key, value]) => (
              <div className="min-w-0" key={key}>
                <dt className="text-xs font-semibold text-[var(--muted)]">{key}</dt>
                <dd className="mt-1 break-words text-sm text-[var(--ink)]">
                  {Array.isArray(value) ? value.join(", ") : value || "—"}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      {row.resolution && !isEditing ? (
        <div className="border-t border-[var(--border)] px-4 py-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-[var(--ink)]">
                {row.resolution.status === "corrected" ? "Identity corrected" : "Row excluded"}
              </p>
              {identity && (
                <p className="mt-1 text-sm text-[var(--slate)]">
                  {identity.name ? `${identity.name} · ` : ""}{identity.email}
                </p>
              )}
              <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
                {row.resolution.note} · {row.resolution.resolverLabel} · {formatResolutionDate(row.resolution.resolvedAt)}
              </p>
            </div>
            <button
              className="min-h-10 rounded-md border border-[var(--border-strong)] bg-white px-3 py-2 text-xs font-semibold hover:bg-[var(--subtle)]"
              onClick={() => {
                setDraft(initialDraft(row));
                setIsEditing(true);
                setError(null);
              }}
              type="button"
            >
              Edit resolution
            </button>
          </div>
        </div>
      ) : (
        <form
          className="border-t border-[var(--border)] bg-white px-4 py-4"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <fieldset disabled={isSaving}>
            <legend className="text-sm font-semibold text-[var(--ink)]">Resolve this row</legend>
            <div className="mt-3 flex flex-wrap gap-4 text-sm">
              <label className="flex min-h-10 items-center gap-2">
                <input
                  checked={draft.status === "corrected"}
                  name={`${row.eventId}-${row.rowNumber}-outcome`}
                  onChange={() => setDraft((current) => ({ ...current, status: "corrected" }))}
                  type="radio"
                />
                Confirm or correct identity
              </label>
              <label className="flex min-h-10 items-center gap-2">
                <input
                  checked={draft.status === "excluded"}
                  name={`${row.eventId}-${row.rowNumber}-outcome`}
                  onChange={() => setDraft((current) => ({ ...current, status: "excluded" }))}
                  type="radio"
                />
                Exclude row
              </label>
            </div>

            {draft.status === "corrected" && (
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <label className="grid gap-1.5 text-xs font-semibold text-[var(--slate)]">
                  Canonical email
                  <input
                    className="h-10 rounded-md border border-[var(--border-strong)] bg-white px-3 text-sm font-normal text-[var(--ink)] outline-none focus:border-[var(--action)] focus:ring-2 focus:ring-[var(--action-ring)]"
                    onChange={(event) => setDraft((current) => ({ ...current, email: event.target.value }))}
                    type="email"
                    value={draft.email}
                  />
                </label>
                <label className="grid gap-1.5 text-xs font-semibold text-[var(--slate)]">
                  Corrected name <span className="font-normal">(optional)</span>
                  <input
                    className="h-10 rounded-md border border-[var(--border-strong)] bg-white px-3 text-sm font-normal text-[var(--ink)] outline-none focus:border-[var(--action)] focus:ring-2 focus:ring-[var(--action-ring)]"
                    onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
                    type="text"
                    value={draft.name}
                  />
                </label>
              </div>
            )}

            <label className="mt-4 grid gap-1.5 text-xs font-semibold text-[var(--slate)]">
              Resolution note
              <textarea
                className="min-h-20 resize-y rounded-md border border-[var(--border-strong)] bg-white px-3 py-2 text-sm font-normal text-[var(--ink)] outline-none focus:border-[var(--action)] focus:ring-2 focus:ring-[var(--action-ring)]"
                onChange={(event) => setDraft((current) => ({ ...current, note: event.target.value }))}
                placeholder="How did you verify this identity or why should the row be excluded?"
                value={draft.note}
              />
            </label>
          </fieldset>

          {error && <p className="mt-3 text-sm text-[var(--error-text)]" role="alert">{error}</p>}
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              className="min-h-10 rounded-md bg-[var(--action)] px-4 py-2 text-xs font-semibold text-white hover:bg-[var(--action-hover)] disabled:cursor-wait disabled:opacity-60"
              disabled={isSaving}
              type="submit"
            >
              {isSaving ? "Saving resolution…" : "Save resolution"}
            </button>
            {row.resolution && (
              <button
                className="min-h-10 rounded-md border border-[var(--border-strong)] bg-white px-4 py-2 text-xs font-semibold hover:bg-[var(--subtle)]"
                disabled={isSaving}
                onClick={() => {
                  setDraft(initialDraft(row));
                  setIsEditing(false);
                  setError(null);
                }}
                type="button"
              >
                Cancel
              </button>
            )}
          </div>
        </form>
      )}
    </li>
  );
}

export function AttendanceReviewQueue({
  initialAttendedOnly = false,
  initialEventId,
}: {
  initialAttendedOnly?: boolean;
  initialEventId?: string;
}) {
  const [records, setRecords] = useState<SessionEventRecord[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [view, setView] = useState<ReviewView>("open");
  const [query, setQuery] = useState("");
  const [eventId, setEventId] = useState(initialEventId ?? "");
  const [issueCode, setIssueCode] = useState<ImportIssueCode | "">("");
  const [attendedOnly, setAttendedOnly] = useState(initialAttendedOnly);
  const [operatorLabel, setOperatorLabel] = useState("");
  const [page, setPage] = useState(1);
  const [announcement, setAnnouncement] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load(): Promise<void> {
      try {
        const savedRecords = await loadEventRecords();
        if (!cancelled) {
          setRecords(savedRecords);
          setLoadError(null);
        }
      } catch {
        if (!cancelled) setLoadError("Review rows could not be loaded. Please try again.");
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [loadAttempt]);

  const rows = useMemo(() => buildReviewQueue(records ?? []), [records]);
  const stats = useMemo(() => reviewQueueStats(rows), [rows]);
  const filtered = useMemo(
    () => filterReviewQueue(rows, {
      view,
      query,
      ...(eventId ? { eventId } : {}),
      ...(issueCode ? { issueCode } : {}),
      attendedOnly,
    }),
    [attendedOnly, eventId, issueCode, query, rows, view],
  );
  const pageCount = Math.max(1, Math.ceil(filtered.length / REVIEW_PAGE_SIZE));
  const visibleRows = paginateReviewQueue(filtered, Math.min(page, pageCount));
  const events = useMemo(
    () => Array.from(new Map(rows.map((row) => [row.eventId, row.eventName])).entries()),
    [rows],
  );

  function handleResolved(row: ReviewQueueRow, resolution: RowResolution): void {
    setRecords((current) => current
      ? applyRowResolution(current, row.eventId, row.rowNumber, resolution)
      : current,
    );
    setAnnouncement(
      `${row.eventName}, row ${row.rowNumber} was ${resolution.status === "corrected" ? "corrected" : "excluded"}.`,
    );
  }

  if (loadError) {
    return (
      <section className="review-state" role="alert">
        <h2>Review queue unavailable</h2>
        <p>{loadError}</p>
        <button className="review-primary-button" onClick={() => setLoadAttempt((value) => value + 1)} type="button">
          Try again
        </button>
      </section>
    );
  }

  if (records === null) {
    return <p className="review-state" aria-live="polite">Loading review queue…</p>;
  }

  return (
    <div className="review-workspace">
      <p className="sr-only" aria-live="polite">{announcement}</p>

      <section className="review-summary" aria-labelledby="review-summary-title">
        <div>
          <h2 id="review-summary-title">Queue status</h2>
          <p>Original source values and attendance signals stay unchanged after resolution.</p>
        </div>
        <dl>
          <div><dt>Needs review</dt><dd>{stats.openCount}</dd></div>
          <div><dt>Checked in</dt><dd>{stats.openAttendedCount}</dd></div>
          <div><dt>Corrected</dt><dd>{stats.correctedCount}</dd></div>
          <div><dt>Excluded</dt><dd>{stats.excludedCount}</dd></div>
        </dl>
      </section>

      <section className="review-controls" aria-label="Review queue controls">
        <div className="review-view-tabs" role="group" aria-label="Resolution status">
          <button aria-pressed={view === "open"} onClick={() => { setView("open"); setPage(1); }} type="button">
            Needs review ({stats.openCount})
          </button>
          <button aria-pressed={view === "resolved"} onClick={() => { setView("resolved"); setPage(1); }} type="button">
            Resolved ({stats.correctedCount + stats.excludedCount})
          </button>
        </div>

        <label className="review-operator-field">
          <span>Your name or initials</span>
          <input
            onChange={(event) => setOperatorLabel(event.target.value)}
            placeholder="Required to save"
            type="text"
            value={operatorLabel}
          />
        </label>

        <div className="review-filters">
          <label>
            <span>Search</span>
            <input onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="Event, name, email, or row" type="search" value={query} />
          </label>
          <label>
            <span>Event</span>
            <select onChange={(event) => { setEventId(event.target.value); setPage(1); }} value={eventId}>
              <option value="">All events</option>
              {events.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
            </select>
          </label>
          <label>
            <span>Issue</span>
            <select onChange={(event) => { setIssueCode(event.target.value as ImportIssueCode | ""); setPage(1); }} value={issueCode}>
              <option value="">All row errors</option>
              {ISSUE_OPTIONS.map((option) => <option key={option.code} value={option.code}>{option.label}</option>)}
            </select>
          </label>
          <label className="review-checkbox">
            <input checked={attendedOnly} onChange={(event) => { setAttendedOnly(event.target.checked); setPage(1); }} type="checkbox" />
            Checked-in rows only
          </label>
        </div>
      </section>

      <section className="review-results" aria-labelledby="review-results-title">
        <div className="review-results-heading">
          <div>
            <h2 id="review-results-title">{view === "open" ? "Rows needing review" : "Resolved rows"}</h2>
            <p>{filtered.length} {filtered.length === 1 ? "row" : "rows"} match the current filters.</p>
          </div>
          {(query || eventId || issueCode || attendedOnly) && (
            <button onClick={() => { setQuery(""); setEventId(""); setIssueCode(""); setAttendedOnly(false); }} type="button">
              Clear filters
            </button>
          )}
        </div>

        {visibleRows.length > 0 ? (
          <ul className="review-list">
            {visibleRows.map((row) => (
              <ReviewItem
                key={`${row.eventId}-${row.rowNumber}-${row.resolution?.resolvedAt ?? "open"}`}
                onResolved={handleResolved}
                operatorLabel={operatorLabel}
                row={row}
              />
            ))}
          </ul>
        ) : (
          <div className="review-empty">
            <h3>{view === "open" && stats.openCount === 0 ? "No rows need review" : "No matching rows"}</h3>
            <p>{view === "open" && stats.openCount === 0 ? "Every saved row error has a recorded outcome." : "Clear or change the filters to see other rows."}</p>
            {records.length === 0 && <Link href="/upload">Upload an event</Link>}
          </div>
        )}

        {pageCount > 1 && (
          <nav className="review-pagination" aria-label="Review queue pages">
            <button disabled={page <= 1} onClick={() => setPage((value) => value - 1)} type="button">Previous</button>
            <span>Page {Math.min(page, pageCount)} of {pageCount}</span>
            <button disabled={page >= pageCount} onClick={() => setPage((value) => value + 1)} type="button">Next</button>
          </nav>
        )}
      </section>
    </div>
  );
}
