"use client";

import {
  type ChangeEvent,
  type DragEvent,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  EMPTY_EVENT_DETAILS,
  fillEventDetailsFromImport,
} from "@/lib/events/details";
import { parseAttendanceCsv } from "@/lib/csv/import";
import type { EventDetails } from "@/types/event";
import type { AttendanceImportResult, ImportIssue } from "@/types/import";

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;
const PREVIEW_ROW_LIMIT = 100;

interface LoadedImport {
  fileName: string;
  fileSize: number;
  result: AttendanceImportResult;
}

interface PreviewRow {
  rowNumber: number;
  label: string;
  email?: string;
  sourceEmails?: string;
  status?: string;
  issues: ImportIssue[];
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function sourceLabel(source: AttendanceImportResult["source"]): string {
  if (source === "luma") {
    return "Luma";
  }
  if (source === "engage") {
    return "NYU Engage";
  }
  return "Source not detected";
}

function previewRows(result: AttendanceImportResult): PreviewRow[] {
  if (result.source === "luma") {
    return result.data.rows.map((row) => ({
      rowNumber: row.rowNumber,
      label: row.attendee?.name || row.attendee?.email || `Row ${row.rowNumber}`,
      email: row.attendee?.email,
      status: row.attendee?.registrationStatus || row.attendee?.approvalStatus,
      issues: row.issues,
    }));
  }

  if (result.source === "engage") {
    return result.data.rows.map((row) => {
      const sourceEmails = [
        row.attendee.campusEmail && `Campus: ${row.attendee.campusEmail}`,
        row.attendee.preferredEmail &&
          `Preferred: ${row.attendee.preferredEmail}`,
      ]
        .filter(Boolean)
        .join(" | ");

      return {
        rowNumber: row.rowNumber,
        label: row.attendee.name || row.attendee.email || `Row ${row.rowNumber}`,
        email: row.attendee.email,
        ...(sourceEmails && { sourceEmails }),
        status: row.attendee.attendanceStatus,
        issues: row.issues,
      };
    });
  }

  return [];
}

function externalHttpUrl(value: string): string | undefined {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.toString()
      : undefined;
  } catch {
    return undefined;
  }
}

function eventDateLabel(details: EventDetails): string {
  if (details.startDate && details.startDate === details.endDate) {
    return details.startDate;
  }
  if (details.startDate && details.endDate) {
    return `${details.startDate} to ${details.endDate}`;
  }
  return details.startDate || details.endDate || "Date not added";
}

export function AttendanceCsvImporter() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [eventDetails, setEventDetails] =
    useState<EventDetails>(EMPTY_EVENT_DETAILS);
  const [loadedImport, setLoadedImport] = useState<LoadedImport | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [isReading, setIsReading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const allIssues = useMemo(() => {
    if (!loadedImport) {
      return [];
    }

    return [
      ...loadedImport.result.data.fileIssues,
      ...previewRows(loadedImport.result).flatMap((row) => row.issues),
    ];
  }, [loadedImport]);

  async function loadFile(file: File): Promise<void> {
    setFileError(null);

    if (!file.name.toLowerCase().endsWith(".csv")) {
      setFileError("Choose a CSV file exported from Luma or NYU Engage.");
      return;
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      setFileError(
        "This file is larger than 5 MB. Export a smaller attendance CSV and try again.",
      );
      return;
    }

    setIsReading(true);
    try {
      const csvText = await file.text();
      const result = parseAttendanceCsv(csvText);

      setLoadedImport({
        fileName: file.name,
        fileSize: file.size,
        result,
      });
      setEventDetails((currentDetails) =>
        fillEventDetailsFromImport(currentDetails, result),
      );
    } catch {
      setLoadedImport(null);
      setFileError(
        "The file could not be read. Export it again from Luma or NYU Engage and retry.",
      );
    } finally {
      setIsReading(false);
    }
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>): void {
    const file = event.target.files?.[0];
    if (file) {
      void loadFile(file);
    }
  }

  function handleDrop(event: DragEvent<HTMLDivElement>): void {
    event.preventDefault();
    setIsDragging(false);
    const file = event.dataTransfer.files[0];
    if (file) {
      void loadFile(file);
    }
  }

  function updateEventDetail(field: keyof EventDetails, value: string): void {
    setEventDetails((currentDetails) => ({
      ...currentDetails,
      [field]: value,
    }));
  }

  function resetImport(): void {
    setLoadedImport(null);
    setFileError(null);
    if (inputRef.current) {
      inputRef.current.value = "";
    }
  }

  return (
    <div className="space-y-8">
      <EventDetailsEditor
        details={eventDetails}
        importResult={loadedImport?.result}
        onChange={updateEventDetail}
      />

      <section className="overflow-hidden rounded-3xl border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-card)]">
        <div className="grid lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="p-6 sm:p-8 lg:p-10">
            <div className="mb-7 flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-[var(--action)]">
                  Attendance source
                </p>
                <h2 className="mt-2 text-2xl font-medium tracking-[-0.03em]">
                  Add the event attendance
                </h2>
                <p className="mt-2 max-w-xl text-sm leading-6 text-[var(--muted)]">
                  Upload one Luma or NYU Engage export. Every source row stays
                  visible for review.
                </p>
              </div>
              <span className="rounded-md bg-[var(--lavender)] px-3 py-1.5 text-xs font-semibold text-[var(--ink)]">
                {loadedImport
                  ? sourceLabel(loadedImport.result.source)
                  : "Auto-detect source"}
              </span>
            </div>

            <input
              ref={inputRef}
              accept=".csv,text/csv"
              className="sr-only"
              id="attendance-csv"
              onChange={handleFileChange}
              type="file"
            />

            <div
              className={`grid min-h-56 place-items-center rounded-3xl border border-dashed px-6 py-10 text-center transition-colors ${
                isDragging
                  ? "border-[var(--action)] bg-[var(--periwinkle)]"
                  : "border-[var(--border-strong)] bg-[var(--canvas)]"
              }`}
              onDragEnter={(event) => {
                event.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={handleDrop}
            >
              <div>
                <span className="mx-auto grid size-12 place-items-center rounded-xl bg-[var(--sky)] text-xs font-bold tracking-[0.08em] text-[var(--ink)]">
                  CSV
                </span>
                <p className="mt-5 text-sm font-semibold">
                  {isReading
                    ? "Reading your export..."
                    : "Drop an attendance export here"}
                </p>
                <p className="mt-2 text-xs leading-5 text-[var(--muted)]">
                  Up to 5 MB. The file stays in this browser.
                </p>
                <label
                  className="mt-5 inline-flex cursor-pointer items-center rounded-full bg-[var(--action)] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[var(--action-hover)] active:scale-[0.98]"
                  htmlFor="attendance-csv"
                >
                  {loadedImport ? "Choose another CSV" : "Choose CSV"}
                </label>
              </div>
            </div>

            <div aria-live="polite">
              {fileError && (
                <p className="mt-4 rounded-md bg-[var(--error-bg)] px-4 py-3 text-sm text-[var(--error-text)]">
                  {fileError}
                </p>
              )}
            </div>
          </div>

          <aside className="border-t border-[var(--border)] bg-[var(--periwinkle)] p-6 sm:p-8 lg:border-l lg:border-t-0 lg:p-10">
            <h3 className="text-base font-semibold">What gets checked</h3>
            <dl className="mt-7 space-y-6 text-sm">
              <div>
                <dt className="font-semibold">CSV source</dt>
                <dd className="mt-1.5 leading-5 text-[var(--muted)]">
                  Named headers identify Luma or NYU Engage.
                </dd>
              </div>
              <div>
                <dt className="font-semibold">Attendee identity</dt>
                <dd className="mt-1.5 leading-5 text-[var(--muted)]">
                  Emails are trimmed, lowercased, and checked for conflicts.
                </dd>
              </div>
              <div>
                <dt className="font-semibold">Source rows</dt>
                <dd className="mt-1.5 leading-5 text-[var(--muted)]">
                  Invalid and duplicate rows stay visible.
                </dd>
              </div>
            </dl>
          </aside>
        </div>

        {loadedImport ? (
          <ImportPreview
            allIssues={allIssues}
            eventDetails={eventDetails}
            loadedImport={loadedImport}
            onReset={resetImport}
          />
        ) : (
          <div className="flex flex-col gap-1 border-t border-[var(--border)] px-6 py-5 text-xs text-[var(--muted)] sm:flex-row sm:items-center sm:justify-between sm:px-10">
            <span>No attendance file selected</span>
            <span>CSV and UTF-8 recommended</span>
          </div>
        )}
      </section>
    </div>
  );
}

function EventDetailsEditor({
  details,
  importResult,
  onChange,
}: {
  details: EventDetails;
  importResult?: AttendanceImportResult;
  onChange: (field: keyof EventDetails, value: string) => void;
}) {
  const importedEngageDetails =
    importResult?.source === "engage" &&
    Object.values(importResult.data.metadata).some(Boolean);

  return (
    <section className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-[var(--shadow-card)] sm:p-8 lg:p-10">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-[var(--action)]">Event details</p>
          <h2 className="mt-2 text-2xl font-medium tracking-[-0.03em]">
            Give this import a home
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted)]">
            Add the links your team uses. Engage exports fill the event name and
            dates when available.
          </p>
        </div>
        <p
          aria-live="polite"
          className={`self-start rounded-md px-3 py-1.5 text-xs font-semibold ${
            importedEngageDetails
              ? "bg-[var(--mint)] text-[var(--ink)]"
              : "bg-[var(--cloud)] text-[var(--muted)]"
          }`}
        >
          {importedEngageDetails
            ? "Engage details added"
            : "Add now or upload Engage first"}
        </p>
      </div>

      <div className="mt-8 grid gap-5 md:grid-cols-2">
        <EventField
          className="md:col-span-2"
          label="Event name"
          name="name"
          onChange={onChange}
          placeholder="Community Demo Night"
          value={details.name}
        />
        <EventField
          label="Luma or Engage event link"
          name="eventUrl"
          onChange={onChange}
          placeholder="https://lu.ma/..."
          type="url"
          value={details.eventUrl}
        />
        <EventField
          label="Instagram post link"
          name="instagramUrl"
          onChange={onChange}
          placeholder="https://instagram.com/p/..."
          type="url"
          value={details.instagramUrl}
        />
        <EventField
          label="Start date"
          name="startDate"
          onChange={onChange}
          placeholder="3/23/2026"
          value={details.startDate}
        />
        <EventField
          label="End date"
          name="endDate"
          onChange={onChange}
          placeholder="3/23/2026"
          value={details.endDate}
        />
      </div>
    </section>
  );
}

function EventField({
  className = "",
  label,
  name,
  onChange,
  placeholder,
  type = "text",
  value,
}: {
  className?: string;
  label: string;
  name: keyof EventDetails;
  onChange: (field: keyof EventDetails, value: string) => void;
  placeholder: string;
  type?: "text" | "url";
  value: string;
}) {
  return (
    <label className={`grid gap-2 ${className}`}>
      <span className="text-sm font-semibold text-[var(--ink)]">{label}</span>
      <input
        className="h-12 rounded-md border border-[var(--border-strong)] bg-white px-4 text-sm text-[var(--ink)] outline-none transition placeholder:text-[var(--iron)] focus:border-[var(--action)] focus:ring-4 focus:ring-[var(--action-ring)]"
        name={name}
        onChange={(event) => onChange(name, event.target.value)}
        placeholder={placeholder}
        type={type}
        value={value}
      />
    </label>
  );
}

function ImportPreview({
  loadedImport,
  allIssues,
  eventDetails,
  onReset,
}: {
  loadedImport: LoadedImport;
  allIssues: ImportIssue[];
  eventDetails: EventDetails;
  onReset: () => void;
}) {
  const { result } = loadedImport;
  const { data } = result;
  const visibleRows = previewRows(result).slice(0, PREVIEW_ROW_LIMIT);

  return (
    <div className="border-t border-[var(--border)] p-6 sm:p-8 lg:p-10">
      <EventContext details={eventDetails} />

      <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{loadedImport.fileName}</p>
          <p className="mt-1 text-xs text-[var(--muted)]">
            {formatFileSize(loadedImport.fileSize)} | {sourceLabel(result.source)} |{" "}
            {data.detectedHeaders.length} columns detected
          </p>
        </div>
        <button
          className="self-start rounded-full border border-[var(--border-strong)] bg-white px-4 py-2 text-xs font-semibold text-[var(--ink)] transition hover:bg-[var(--cloud)] active:scale-[0.98]"
          onClick={onReset}
          type="button"
        >
          Clear attendance
        </button>
      </div>

      <div className="mt-7 grid overflow-hidden rounded-3xl sm:grid-cols-3">
        <Stat className="bg-[var(--sky)]" label="Source rows" value={data.rows.length} />
        <Stat className="bg-[var(--mint)]" label="Ready" value={data.validRowCount} />
        <Stat
          className="bg-[var(--lavender)]"
          label="Needs review"
          value={data.invalidRowCount}
        />
      </div>

      {allIssues.length > 0 ? (
        <IssueList issues={allIssues} />
      ) : (
        <div className="mt-7 rounded-md bg-[var(--success-bg)] px-5 py-4 text-sm text-[var(--success-text)]">
          All rows passed validation. This attendance is ready to use in a future event record.
        </div>
      )}

      <div className="mt-9">
        <div className="mb-4 flex items-end justify-between gap-4">
          <h3 className="text-lg font-semibold">Attendee preview</h3>
          {data.rows.length > PREVIEW_ROW_LIMIT && (
            <p className="text-xs text-[var(--muted)]">
              Showing the first {PREVIEW_ROW_LIMIT} rows
            </p>
          )}
        </div>

        {visibleRows.length > 0 ? (
          <RowsTable rows={visibleRows} />
        ) : (
          <p className="rounded-3xl border border-[var(--border)] bg-[var(--canvas)] px-5 py-10 text-center text-sm text-[var(--muted)]">
            No attendee rows were found in this file.
          </p>
        )}
      </div>
    </div>
  );
}

function EventContext({ details }: { details: EventDetails }) {
  const eventUrl = externalHttpUrl(details.eventUrl);
  const instagramUrl = externalHttpUrl(details.instagramUrl);

  return (
    <div className="rounded-3xl bg-[var(--action)] p-6 text-white sm:p-8">
      <p className="text-xs font-semibold text-white/75">Current event</p>
      <div className="mt-2 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h3 className="text-2xl font-medium tracking-[-0.03em] sm:text-3xl">
            {details.name || "Add an event name"}
          </h3>
          <p className="mt-2 text-sm text-white/80">{eventDateLabel(details)}</p>
        </div>
        {(eventUrl || instagramUrl) && (
          <div className="flex flex-wrap gap-2">
            {eventUrl && (
              <a
                className="rounded-full bg-white px-4 py-2 text-xs font-semibold text-[var(--action)] transition hover:bg-[var(--cloud)] active:scale-[0.98]"
                href={eventUrl}
                rel="noreferrer"
                target="_blank"
              >
                Open event page
              </a>
            )}
            {instagramUrl && (
              <a
                className="rounded-full border border-white/50 px-4 py-2 text-xs font-semibold text-white transition hover:bg-white/10 active:scale-[0.98]"
                href={instagramUrl}
                rel="noreferrer"
                target="_blank"
              >
                Open Instagram post
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function IssueList({ issues }: { issues: ImportIssue[] }) {
  return (
    <div className="mt-7 rounded-3xl border border-[#f1d5d7] bg-[#fffafa] p-5 sm:p-6">
      <div className="flex items-center justify-between gap-4">
        <h3 className="text-sm font-semibold">Issues to review</h3>
        <span className="rounded-md bg-[var(--error-bg)] px-2.5 py-1 text-xs font-semibold text-[var(--error-text)]">
          {issues.length} {issues.length === 1 ? "issue" : "issues"}
        </span>
      </div>
      <ul className="mt-4 divide-y divide-[#f1e1e2] text-sm">
        {issues.slice(0, 20).map((issue, index) => (
          <li
            className="flex gap-4 py-3 first:pt-0 last:pb-0"
            key={`${issue.code}-${issue.rowNumber ?? "file"}-${index}`}
          >
            <span className="w-16 shrink-0 text-xs font-semibold text-[var(--error-text)]">
              {issue.rowNumber ? `Row ${issue.rowNumber}` : "File"}
            </span>
            <span className="leading-5 text-[#625b59]">{issue.message}</span>
          </li>
        ))}
      </ul>
      {issues.length > 20 && (
        <p className="mt-4 text-xs text-[var(--muted)]">
          {issues.length - 20} more issues appear in the preview below.
        </p>
      )}
    </div>
  );
}

function RowsTable({ rows }: { rows: PreviewRow[] }) {
  return (
    <div className="overflow-x-auto rounded-3xl border border-[var(--border)]">
      <table className="w-full min-w-[760px] border-collapse text-left text-sm">
        <thead className="bg-[var(--cloud)] text-xs text-[var(--muted)]">
          <tr>
            <th className="w-16 px-4 py-3 font-semibold">Row</th>
            <th className="px-4 py-3 font-semibold">Attendee</th>
            <th className="px-4 py-3 font-semibold">Normalized identity</th>
            <th className="px-4 py-3 font-semibold">Source status</th>
            <th className="w-32 px-4 py-3 font-semibold">Validation</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--border)] bg-white">
          {rows.map((row) => (
            <tr className="align-top" key={row.rowNumber}>
              <td className="px-4 py-3.5 text-xs text-[var(--muted)]">
                {row.rowNumber}
              </td>
              <td className="px-4 py-3.5 font-medium">{row.label}</td>
              <td className="px-4 py-3.5">
                <span className="block text-xs text-[var(--ink)]">
                  {row.email || "Not available"}
                </span>
                {row.sourceEmails && (
                  <span className="mt-1 block max-w-md text-[11px] leading-4 text-[var(--muted)]">
                    {row.sourceEmails}
                  </span>
                )}
              </td>
              <td className="px-4 py-3.5 text-xs text-[var(--muted)]">
                {row.status || "Not available"}
              </td>
              <td className="px-4 py-3.5">
                <span
                  className={`inline-flex rounded-md px-2.5 py-1 text-xs font-semibold ${
                    row.issues.length > 0
                      ? "bg-[var(--error-bg)] text-[var(--error-text)]"
                      : "bg-[var(--success-bg)] text-[var(--success-text)]"
                  }`}
                >
                  {row.issues.length > 0 ? "Review" : "Ready"}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Stat({
  className,
  label,
  value,
}: {
  className: string;
  label: string;
  value: number;
}) {
  return (
    <div className={`px-5 py-6 ${className}`}>
      <p className="text-3xl font-medium tracking-[-0.04em] text-[var(--ink)]">
        {value}
      </p>
      <p className="mt-1 text-xs font-medium text-[var(--slate)]">{label}</p>
    </div>
  );
}
