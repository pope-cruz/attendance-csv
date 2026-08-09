"use client";

import { Column, Grid } from "@carbon/react";
import {
  type ChangeEvent,
  type DragEvent,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  classifyLumaAttendance,
  classifyEngageAttendance,
} from "@/lib/attendance/classify";
import {
  summarizeAttendance,
  summarizeSessionEvents,
} from "@/lib/attendance/summary";
import {
  EMPTY_EVENT_DETAILS,
  fillEventDetailsFromImport,
} from "@/lib/events/details";
import { removeEventFromCollection } from "@/lib/events/collection";
import { createEventRecord } from "@/lib/events/record";
import {
  clearEventRecords,
  deleteEventRecord,
  loadEventRecords,
  saveEventRecord,
} from "@/lib/persistence";
import { parseAttendanceCsv } from "@/lib/csv/import";
import type {
  EventAttendanceImport,
  EventDetails,
  SessionEventRecord,
} from "@/types/event";
import type { AttendanceImportResult, ImportIssue } from "@/types/import";

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;
const PREVIEW_ROW_LIMIT = 100;

interface PreviewRow {
  rowNumber: number;
  label: string;
  email?: string;
  sourceEmails?: string;
  status: string;
  attended: boolean;
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
    return result.data.rows.map((row) => {
      const classification = classifyLumaAttendance(row.attendee);
      const checkInValue = row.attendee?.checkInTime || row.attendee?.checkedIn;
      return {
        rowNumber: row.rowNumber,
        label: row.attendee?.name || row.attendee?.email || `Row ${row.rowNumber}`,
        email: row.attendee?.email,
        status:
          classification.status === "attended"
            ? checkInValue
              ? `Checked in — ${checkInValue}`
              : "Attended"
            : checkInValue
              ? `Not checked in — ${checkInValue}`
              : "Not checked in",
        attended: classification.status === "attended",
        issues: row.issues,
      };
    });
  }

  if (result.source === "engage") {
    return result.data.rows.map((row) => {
      const classification = classifyEngageAttendance(row.attendee);
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
        status:
          classification.status === "attended"
            ? row.attendee.attendanceStatus || "Attended"
            : row.attendee.attendanceStatus || "Not marked attended",
        attended: classification.status === "attended",
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
  const pendingEventIdRef = useRef<string | null>(null);
  const [eventDetails, setEventDetails] =
    useState<EventDetails>(EMPTY_EVENT_DETAILS);
  const [loadedImport, setLoadedImport] =
    useState<EventAttendanceImport | null>(null);
  const [sessionEvents, setSessionEvents] = useState<SessionEventRecord[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [isLoadingEvents, setIsLoadingEvents] = useState(true);
  const [isSavingEvent, setIsSavingEvent] = useState(false);
  const [isClearingEvents, setIsClearingEvents] = useState(false);
  const [isDeletingEvent, setIsDeletingEvent] = useState(false);
  const [isConfirmingClear, setIsConfirmingClear] = useState(false);
  const [eventIdPendingDeletion, setEventIdPendingDeletion] = useState<
    string | null
  >(null);
  const [persistenceError, setPersistenceError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [recordError, setRecordError] = useState<string | null>(null);
  const [lastAddedEventName, setLastAddedEventName] = useState<string | null>(
    null,
  );
  const [fileError, setFileError] = useState<string | null>(null);
  const [isReading, setIsReading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const selectedEvent =
    sessionEvents.find((event) => event.id === selectedEventId) ?? null;

  useEffect(() => {
    let isCancelled = false;

    async function restoreEvents(): Promise<void> {
      try {
        const storedEvents = await loadEventRecords();

        if (!isCancelled) {
          setSessionEvents(storedEvents);
          setSelectedEventId(storedEvents.at(-1)?.id ?? null);
          setPersistenceError(null);
        }
      } catch {
        if (!isCancelled) {
          setPersistenceError(
            "Saved events could not be loaded. Please try again.",
          );
        }
      } finally {
        if (!isCancelled) {
          setIsLoadingEvents(false);
        }
      }
    }

    void restoreEvents();

    return () => {
      isCancelled = true;
    };
  }, []);

  async function loadFile(file: File): Promise<void> {
    setFileError(null);
    setRecordError(null);
    setLastAddedEventName(null);

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
      pendingEventIdRef.current = null;
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
    setRecordError(null);
    setLastAddedEventName(null);
    setEventDetails((currentDetails) => ({
      ...currentDetails,
      [field]: value,
    }));
  }

  function resetImport(): void {
    setLoadedImport(null);
    pendingEventIdRef.current = null;
    setFileError(null);
    setRecordError(null);
    setLastAddedEventName(null);
    if (inputRef.current) {
      inputRef.current.value = "";
    }
  }

  async function addEventToSession(): Promise<void> {
    if (isLoadingEvents) {
      setRecordError("Wait for saved events to finish loading before adding one.");
      return;
    }

    if (persistenceError) {
      setRecordError(
        "Resolve the storage error before adding another event.",
      );
      return;
    }

    const eventId = pendingEventIdRef.current ?? crypto.randomUUID();
    const result = createEventRecord(eventId, eventDetails, loadedImport);

    if (!result.ok) {
      setRecordError(result.message);
      return;
    }

    pendingEventIdRef.current = eventId;
    setIsSavingEvent(true);
    try {
      await saveEventRecord(result.record);
      setSessionEvents((currentEvents) => [...currentEvents, result.record]);
      setSelectedEventId(result.record.id);
      setLastAddedEventName(result.record.details.name);
      setRecordError(null);
      setEventDetails(EMPTY_EVENT_DETAILS);
      setLoadedImport(null);
      pendingEventIdRef.current = null;
      setFileError(null);
      if (inputRef.current) {
        inputRef.current.value = "";
      }
    } catch {
      setRecordError(
        "This event could not be saved. Your import is still open so you can try again.",
      );
    } finally {
      setIsSavingEvent(false);
    }
  }

  async function clearAllEvents(): Promise<void> {
    setIsClearingEvents(true);
    try {
      await clearEventRecords();
      setSessionEvents([]);
      setSelectedEventId(null);
      setLastAddedEventName(null);
      setPersistenceError(null);
      setDeleteError(null);
      setEventIdPendingDeletion(null);
      setIsConfirmingClear(false);
    } catch {
      setPersistenceError(
        "Events could not be cleared. Please try again.",
      );
    } finally {
      setIsClearingEvents(false);
    }
  }

  async function deleteLocalEvent(eventId: string): Promise<void> {
    setIsDeletingEvent(true);
    setDeleteError(null);

    try {
      await deleteEventRecord(eventId);
      const nextCollection = removeEventFromCollection(
        sessionEvents,
        eventId,
        selectedEventId,
      );

      setSessionEvents(nextCollection.records);
      setSelectedEventId(nextCollection.selectedEventId);
      setEventIdPendingDeletion(null);
      setLastAddedEventName(null);
    } catch {
      setDeleteError(
        "This event could not be removed. Please try again.",
      );
    } finally {
      setIsDeletingEvent(false);
    }
  }

  return (
    <div className="attendance-workspace">
      <Grid
        fullWidth
        narrow
        withRowGap
        className="attendance-shell-grid attendance-setup-grid"
      >
        <Column sm={4} md={8} lg={10}>
          <section className="import-panel carbon-panel overflow-hidden border border-[var(--border)] bg-[var(--surface)]">
            <div className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="panel-step">Step 01</p>
                  <h2 className="text-lg font-semibold tracking-[-0.01em]">
                    Upload attendance CSV
                  </h2>
                  <p className="mt-1 max-w-xl text-sm leading-6 text-[var(--muted)]">
                    Choose one unmodified export. Every source row remains visible
                    for review.
                  </p>
                </div>
                <span className="rounded-md bg-[var(--action-soft)] px-2.5 py-1 text-xs font-semibold text-[var(--action)]">
                  {loadedImport
                    ? sourceLabel(loadedImport.result.source)
                    : "Source auto-detected"}
                </span>
              </div>

              <input
                ref={inputRef}
                accept=".csv,text/csv"
                className="peer sr-only"
                id="attendance-csv"
                onChange={handleFileChange}
                type="file"
              />

              <div
                className={`carbon-dropzone mt-6 grid min-h-48 place-items-center border border-dashed px-4 py-8 text-center transition-colors peer-focus-visible:outline peer-focus-visible:outline-3 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--action)] ${
                  isDragging
                    ? "border-[var(--action)] bg-[var(--action-soft)]"
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
                  <span className="mx-auto grid size-10 place-items-center rounded-md bg-[var(--action-soft)] text-[11px] font-bold tracking-[0.06em] text-[var(--action)]">
                    CSV
                  </span>
                  <p className="mt-4 text-sm font-semibold">
                    {isReading
                      ? "Reading your export..."
                      : "Drop an attendance export here"}
                  </p>
                  <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
                    Up to 5 MB. CSVs are processed locally before saving to
                    Supabase.
                  </p>
                  <label
                    className="mt-4 inline-flex min-h-11 cursor-pointer items-center rounded-md bg-[var(--action)] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[var(--action-hover)]"
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

              <ul className="mt-6 grid gap-2 border-t border-[var(--border)] pt-4 text-xs text-[var(--muted)] sm:grid-cols-3">
                <li>
                  <span className="font-semibold text-[var(--ink)]">
                    Detects
                  </span>{" "}
                  CSV source
                </li>
                <li>
                  <span className="font-semibold text-[var(--ink)]">
                    Checks
                  </span>{" "}
                  attendee identity
                </li>
                <li>
                  <span className="font-semibold text-[var(--ink)]">
                    Preserves
                  </span>{" "}
                  source rows
                </li>
              </ul>
            </div>

            <div className="flex flex-col gap-1 border-t border-[var(--border)] px-4 py-3 text-xs text-[var(--muted)] sm:flex-row sm:items-center sm:justify-between">
              <span>
                {loadedImport
                  ? loadedImport.fileName
                  : "No attendance file selected"}
              </span>
              <span>CSV and UTF-8 recommended</span>
            </div>
          </section>
        </Column>

        <Column sm={4} md={8} lg={6}>
          <EventDetailsEditor
            details={eventDetails}
            importResult={loadedImport?.result}
            onChange={updateEventDetail}
          />
        </Column>
      </Grid>

      {isLoadingEvents && (
        <Grid fullWidth narrow className="attendance-shell-grid attendance-content-grid">
          <Column sm={4} md={8} lg={16}>
            <p
              aria-live="polite"
              className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm text-[var(--muted)]"
            >
              Loading saved events...
            </p>
          </Column>
        </Grid>
      )}

      {persistenceError && (
        <Grid fullWidth narrow className="attendance-shell-grid attendance-content-grid">
          <Column sm={4} md={8} lg={16}>
            <StorageError
              isClearing={isClearingEvents}
              isConfirmingClear={isConfirmingClear}
              message={persistenceError}
              onCancelClear={() => setIsConfirmingClear(false)}
              onClear={() => void clearAllEvents()}
              onConfirmClear={() => setIsConfirmingClear(true)}
              showClearControl={sessionEvents.length === 0}
            />
          </Column>
        </Grid>
      )}

      {loadedImport && (
        <Grid fullWidth narrow className="attendance-shell-grid attendance-content-grid">
          <Column sm={4} md={8} lg={16}>
            <section className="carbon-panel border border-[var(--border)] bg-[var(--surface)]">
              <ImportPreview
                eventDetails={eventDetails}
                isAddDisabled={
                  isLoadingEvents ||
                  isSavingEvent ||
                  isClearingEvents ||
                  isDeletingEvent ||
                  Boolean(persistenceError)
                }
                isSavingEvent={isSavingEvent}
                loadedImport={loadedImport}
                onAddToSession={addEventToSession}
                onReset={resetImport}
                recordError={recordError}
              />
            </section>
          </Column>
        </Grid>
      )}

      {(lastAddedEventName || sessionEvents.length > 0) && (
        <Grid fullWidth narrow className="attendance-shell-grid attendance-content-grid">
          <Column sm={4} md={8} lg={16}>
            <SessionEventList
              lastAddedEventName={lastAddedEventName}
              deleteError={deleteError}
              eventIdPendingDeletion={eventIdPendingDeletion}
              isClearing={isClearingEvents}
              isConfirmingClear={isConfirmingClear}
              isDeleting={isDeletingEvent}
              onCancelClear={() => setIsConfirmingClear(false)}
              onCancelDelete={() => {
                setEventIdPendingDeletion(null);
                setDeleteError(null);
              }}
              onClear={() => void clearAllEvents()}
              onConfirmClear={() => {
                setIsConfirmingClear(true);
                setEventIdPendingDeletion(null);
                setDeleteError(null);
              }}
              onConfirmDelete={(eventId) => {
                setIsConfirmingClear(false);
                setEventIdPendingDeletion(eventId);
                setDeleteError(null);
              }}
              onDelete={(eventId) => void deleteLocalEvent(eventId)}
              onSelect={setSelectedEventId}
              records={sessionEvents}
              selectedEventId={selectedEventId}
            />
          </Column>
        </Grid>
      )}

      {selectedEvent && (
        <Grid fullWidth narrow className="attendance-shell-grid attendance-content-grid">
          <Column sm={4} md={8} lg={16}>
            <SelectedEventAttendance record={selectedEvent} />
          </Column>
        </Grid>
      )}
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
    <section className="event-details-panel carbon-panel border border-[var(--border)] bg-[var(--surface)] p-4">
      <div>
        <div>
          <p className="panel-step">Step 01 / context</p>
          <h2 className="text-lg font-semibold tracking-[-0.01em]">
            Event details
          </h2>
          <p className="mt-1 text-sm leading-6 text-[var(--muted)]">
            Add context now or let an Engage export fill available details.
          </p>
        </div>
        <p
          aria-live="polite"
          className={`mt-3 inline-flex rounded-md px-2.5 py-1 text-xs font-semibold ${
            importedEngageDetails
              ? "bg-[var(--success-bg)] text-[var(--success-text)]"
              : "bg-[var(--subtle)] text-[var(--slate)]"
          }`}
        >
          {importedEngageDetails
            ? "Engage details added"
            : "Add now or upload Engage first"}
        </p>
      </div>

      <div className="mt-6 grid gap-4">
        <EventField
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
      <span className="text-sm font-medium text-[var(--ink)]">{label}</span>
      <input
        className="h-11 rounded-lg border border-[var(--border-strong)] bg-white px-3.5 text-sm text-[var(--ink)] outline-none transition-colors placeholder:text-[var(--iron)] focus:border-[var(--action)] focus:ring-4 focus:ring-[var(--action-ring)]"
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
  eventDetails,
  isAddDisabled,
  isSavingEvent,
  onAddToSession,
  onReset,
  recordError,
}: {
  loadedImport: EventAttendanceImport;
  eventDetails: EventDetails;
  isAddDisabled: boolean;
  isSavingEvent: boolean;
  onAddToSession: () => void;
  onReset: () => void;
  recordError: string | null;
}) {
  const { result } = loadedImport;
  const { data } = result;

  return (
    <div className="p-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{loadedImport.fileName}</p>
          <p className="mt-1 text-xs text-[var(--muted)]">
            {formatFileSize(loadedImport.fileSize)} | {sourceLabel(result.source)} |{" "}
            {data.detectedHeaders.length} columns detected
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            className="min-h-10 rounded-md bg-[var(--action)] px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-[var(--action-hover)] disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isAddDisabled}
            onClick={onAddToSession}
            type="button"
          >
            {isSavingEvent ? "Saving event..." : "Add event to session"}
          </button>
          <button
            className="min-h-10 rounded-md border border-[var(--border-strong)] bg-white px-3.5 py-2 text-xs font-semibold text-[var(--ink)] transition-colors hover:bg-[var(--subtle)]"
            onClick={onReset}
            type="button"
          >
            Clear attendance
          </button>
        </div>
      </div>

      <div aria-live="polite">
        {recordError && (
          <p className="mt-4 rounded-md bg-[var(--error-bg)] px-4 py-3 text-sm text-[var(--error-text)]">
            {recordError}
          </p>
        )}
      </div>

      <AttendanceReview
        eventDetails={eventDetails}
        loadedImport={loadedImport}
      />
    </div>
  );
}

function SessionEventList({
  lastAddedEventName,
  deleteError,
  eventIdPendingDeletion,
  isClearing,
  isConfirmingClear,
  isDeleting,
  onCancelClear,
  onCancelDelete,
  onClear,
  onConfirmClear,
  onConfirmDelete,
  onDelete,
  onSelect,
  records,
  selectedEventId,
}: {
  lastAddedEventName: string | null;
  deleteError: string | null;
  eventIdPendingDeletion: string | null;
  isClearing: boolean;
  isConfirmingClear: boolean;
  isDeleting: boolean;
  onCancelClear: () => void;
  onCancelDelete: () => void;
  onClear: () => void;
  onConfirmClear: () => void;
  onConfirmDelete: (eventId: string) => void;
  onDelete: (eventId: string) => void;
  onSelect: (eventId: string) => void;
  records: SessionEventRecord[];
  selectedEventId: string | null;
}) {
  return (
    <section className="carbon-panel border border-[var(--border)] bg-[var(--surface)] p-4">
      {lastAddedEventName && (
        <p
          aria-live="polite"
          className="mb-5 rounded-lg bg-[var(--success-bg)] px-4 py-3 text-sm text-[var(--success-text)]"
        >
          {lastAddedEventName} was added and saved. The form is
          ready for another event.
        </p>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-[-0.01em]">
            Events
          </h2>
          <p className="mt-1 text-sm leading-6 text-[var(--muted)]">
            Shared via Supabase — deleting here removes it for everyone.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <p className="text-xs font-semibold text-[var(--muted)]">
            {records.length} {records.length === 1 ? "event" : "events"}
          </p>
          {!isConfirmingClear && (
            <button
              className="min-h-10 rounded-md border border-[var(--border-strong)] bg-white px-3.5 py-2 text-xs font-semibold text-[var(--ink)] transition-colors hover:bg-[var(--subtle)]"
              disabled={isDeleting}
              onClick={onConfirmClear}
              type="button"
            >
              Clear all events
            </button>
          )}
        </div>
      </div>

      {isConfirmingClear && (
        <ClearEventsConfirmation
          isClearing={isClearing}
          onCancel={onCancelClear}
          onClear={onClear}
        />
      )}

      {deleteError && (
        <p
          aria-live="polite"
          className="mt-4 rounded-md bg-[var(--error-bg)] px-4 py-3 text-sm text-[var(--error-text)]"
        >
          {deleteError}
        </p>
      )}

      {records.length > 0 && (
        <SessionEventsSummaryView summary={summarizeSessionEvents(records)} />
      )}

      <ul className="mt-5 grid gap-2">
        {records.map((record) => {
          const attendanceSummary = summarizeAttendance(record.attendance.result);
          const isSelected = record.id === selectedEventId;

          return (
            <li
              className={`overflow-hidden rounded-lg border transition-colors ${
                isSelected
                  ? "border-[var(--action)] bg-[var(--action-soft)]"
                  : "border-[var(--border)] bg-white"
              }`}
              key={record.id}
            >
              <div className="grid sm:grid-cols-[minmax(0,1fr)_auto] sm:items-stretch">
                <button
                  aria-pressed={isSelected}
                  className="grid min-w-0 gap-3 px-4 py-4 text-left transition-colors hover:bg-[var(--subtle)] disabled:cursor-wait sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
                  disabled={isDeleting}
                  onClick={() => onSelect(record.id)}
                  type="button"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-[var(--ink)]">
                      {record.details.name}
                    </span>
                    <span className="mt-1 block text-xs text-[var(--muted)]">
                      {eventDateLabel(record.details)} | {record.attendance.fileName}
                    </span>
                  </span>
                  <span className="grid gap-1 sm:justify-items-end">
                    <span className="text-xs text-[var(--muted)] sm:text-right">
                      <span className="font-semibold text-[var(--ink)]">
                        {attendanceSummary.attendedCount} attended
                      </span>
                      <span className="text-[var(--muted)]">
                        {" "}
                        of {attendanceSummary.sourceRowCount}
                      </span>
                    </span>
                    <span className="text-xs font-semibold text-[var(--action)]">
                      {isSelected ? "Viewing attendance" : "View attendance"}
                    </span>
                  </span>
                </button>
                <div className="flex items-center border-t border-[var(--border)] px-4 py-3 sm:border-l sm:border-t-0">
                  <button
                    className="min-h-10 rounded-md px-3 py-2 text-xs font-semibold text-[var(--error-text)] transition-colors hover:bg-[var(--error-bg)] disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={isConfirmingClear || isClearing || isDeleting}
                    onClick={() => onConfirmDelete(record.id)}
                    type="button"
                  >
                    Remove
                  </button>
                </div>
              </div>

              {eventIdPendingDeletion === record.id && (
                <DeleteEventConfirmation
                  eventName={record.details.name}
                  isDeleting={isDeleting}
                  onCancel={onCancelDelete}
                  onDelete={() => onDelete(record.id)}
                />
              )}
            </li>
          );
        })}
      </ul>

      <p className="mt-4 text-xs text-[var(--muted)]">
        Events and source rows are stored in Supabase and shared.
      </p>
    </section>
  );
}

function DeleteEventConfirmation({
  eventName,
  isDeleting,
  onCancel,
  onDelete,
}: {
  eventName: string;
  isDeleting: boolean;
  onCancel: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="border-t border-[var(--error-border)] bg-[var(--error-bg)] p-4">
      <p className="text-sm font-semibold text-[var(--error-text)]">
        Remove {eventName}?
      </p>
      <p className="mt-1 text-xs leading-5 text-[var(--slate)]">
        Its event details, attendance, and original source rows will be
        permanently removed from Supabase for everyone.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          className="min-h-10 rounded-md border border-[var(--border-strong)] bg-white px-3.5 py-2 text-xs font-semibold text-[var(--ink)]"
          disabled={isDeleting}
          onClick={onCancel}
          type="button"
        >
          Cancel
        </button>
        <button
          className="min-h-10 rounded-md bg-[var(--error-text)] px-3.5 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isDeleting}
          onClick={onDelete}
          type="button"
        >
          {isDeleting ? "Removing..." : "Remove event"}
        </button>
      </div>
    </div>
  );
}

function StorageError({
  isClearing,
  isConfirmingClear,
  message,
  onCancelClear,
  onClear,
  onConfirmClear,
  showClearControl,
}: {
  isClearing: boolean;
  isConfirmingClear: boolean;
  message: string;
  onCancelClear: () => void;
  onClear: () => void;
  onConfirmClear: () => void;
  showClearControl: boolean;
}) {
  return (
    <section
      aria-live="polite"
      className="rounded-lg border border-[var(--error-border)] bg-[var(--error-bg)] p-4"
    >
      <p className="text-sm text-[var(--error-text)]">{message}</p>
      {showClearControl && !isConfirmingClear && (
        <button
          className="mt-3 min-h-10 rounded-md border border-[var(--error-border)] bg-white px-3.5 py-2 text-xs font-semibold text-[var(--error-text)]"
          onClick={onConfirmClear}
          type="button"
        >
          Clear event data
        </button>
      )}
      {showClearControl && isConfirmingClear && (
        <ClearEventsConfirmation
          isClearing={isClearing}
          onCancel={onCancelClear}
          onClear={onClear}
        />
      )}
    </section>
  );
}

function ClearEventsConfirmation({
  isClearing,
  onCancel,
  onClear,
}: {
  isClearing: boolean;
  onCancel: () => void;
  onClear: () => void;
}) {
  return (
    <div className="mt-4 rounded-lg border border-[var(--error-border)] bg-[var(--error-bg)] p-4">
      <p className="text-sm font-semibold text-[var(--error-text)]">
        Clear all events?
      </p>
      <p className="mt-1 text-xs leading-5 text-[var(--slate)]">
        All events and source rows will be permanently removed from Supabase for everyone.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          className="min-h-10 rounded-md border border-[var(--border-strong)] bg-white px-3.5 py-2 text-xs font-semibold text-[var(--ink)]"
          disabled={isClearing}
          onClick={onCancel}
          type="button"
        >
          Cancel
        </button>
        <button
          className="min-h-10 rounded-md bg-[var(--error-text)] px-3.5 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isClearing}
          onClick={onClear}
          type="button"
        >
          {isClearing ? "Clearing..." : "Clear all events"}
        </button>
      </div>
    </div>
  );
}

function SelectedEventAttendance({ record }: { record: SessionEventRecord }) {
  return (
    <section className="carbon-panel border border-[var(--border)] bg-[var(--surface)] p-4">
      <div>
        <p className="text-xs font-semibold text-[var(--action)]">
          Selected event
        </p>
        <h2 className="mt-1 text-lg font-semibold tracking-[-0.01em]">
          Attendance review
        </h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          {record.attendance.fileName} | {sourceLabel(record.attendance.result.source)}
        </p>
      </div>

      <AttendanceReview
        eventDetails={record.details}
        loadedImport={record.attendance}
      />
    </section>
  );
}

function AttendanceReview({
  eventDetails,
  loadedImport,
}: {
  eventDetails: EventDetails;
  loadedImport: EventAttendanceImport;
}) {
  const { data } = loadedImport.result;
  const attendanceSummary = summarizeAttendance(loadedImport.result);
  const rows = previewRows(loadedImport.result);
  const visibleRows = rows.slice(0, PREVIEW_ROW_LIMIT);
  const attendedRows = rows.filter((row) => row.attended);
  const allIssues = [
    ...data.fileIssues,
    ...rows.flatMap((row) => row.issues),
  ];

  return (
    <>
      <div className="mt-5">
        <EventContext details={eventDetails} />
      </div>

      <div className="mt-5 rounded-lg border border-[var(--border)] bg-[var(--subtle)] p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-sm font-semibold text-[var(--ink)]">
            Who attended
          </h3>
          <span className="text-xs font-medium text-[var(--muted)]">
            {attendanceSummary.attendedCount} of {attendanceSummary.sourceRowCount} rows
          </span>
        </div>
        <p className="mt-1 text-3xl font-semibold tracking-[-0.02em] text-[var(--ink)]">
          {attendanceSummary.attendedCount}
        </p>
        <p className="text-xs font-medium text-[var(--muted)]">
          {loadedImport.result.source === "luma"
            ? "Checked-in via Luma check-in time"
            : "Marked Attended in Engage"}
        </p>
        {attendanceSummary.sourceRowCount > 0 && attendedRows.length === 0 && (
          <p className="mt-2 text-xs leading-5 text-[var(--muted)]">
            No one is marked as attended yet — for Luma that means no check-in time, for Engage no “Attended” status.
          </p>
        )}
      </div>

      {allIssues.length > 0 ? (
        <IssueList issues={allIssues} />
      ) : (
        <div className="mt-5 rounded-lg bg-[var(--success-bg)] px-4 py-3 text-sm text-[var(--success-text)]">
          All rows passed validation. This attendance is ready to use in a future event record.
        </div>
      )}

      <div className="mt-7">
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
          <p className="rounded-lg border border-[var(--border)] bg-[var(--canvas)] px-5 py-8 text-center text-sm text-[var(--muted)]">
            No attendee rows were found in this file.
          </p>
        )}
      </div>
    </>
  );
}

function EventContext({ details }: { details: EventDetails }) {
  const eventUrl = externalHttpUrl(details.eventUrl);
  const instagramUrl = externalHttpUrl(details.instagramUrl);

  return (
    <div className="border-y border-[var(--border)] py-4">
      <p className="text-xs font-semibold text-[var(--muted)]">Current event</p>
      <div className="mt-1 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h3 className="text-lg font-semibold tracking-[-0.01em] text-[var(--ink)]">
            {details.name || "Add an event name"}
          </h3>
          <p className="mt-1 text-sm text-[var(--muted)]">{eventDateLabel(details)}</p>
        </div>
        {(eventUrl || instagramUrl) && (
          <div className="flex flex-wrap gap-2">
            {eventUrl && (
              <a
                className="inline-flex min-h-10 items-center rounded-md bg-[var(--action)] px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-[var(--action-hover)]"
                href={eventUrl}
                rel="noreferrer"
                target="_blank"
              >
                Open event page
              </a>
            )}
            {instagramUrl && (
              <a
                className="inline-flex min-h-10 items-center rounded-md border border-[var(--border-strong)] bg-white px-3.5 py-2 text-xs font-semibold text-[var(--ink)] transition-colors hover:bg-[var(--subtle)]"
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
    <div className="mt-5 rounded-lg border border-[var(--error-border)] bg-[var(--error-bg)] p-4 sm:p-5">
      <div className="flex items-center justify-between gap-4">
        <h3 className="text-sm font-semibold">Issues to review</h3>
        <span className="rounded-md bg-[var(--error-bg)] px-2.5 py-1 text-xs font-semibold text-[var(--error-text)]">
          {issues.length} {issues.length === 1 ? "issue" : "issues"}
        </span>
      </div>
      <ul className="mt-4 divide-y divide-[var(--error-border)] text-sm">
        {issues.slice(0, 20).map((issue, index) => (
          <li
            className="flex gap-4 py-3 first:pt-0 last:pb-0"
            key={`${issue.code}-${issue.rowNumber ?? "file"}-${index}`}
          >
            <span className="w-16 shrink-0 text-xs font-semibold text-[var(--error-text)]">
              {issue.rowNumber ? `Row ${issue.rowNumber}` : "File"}
            </span>
            <span className="leading-5 text-[var(--slate)]">{issue.message}</span>
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
    <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
      <table className="w-full min-w-[760px] border-collapse text-left text-sm">
        <thead className="bg-[var(--subtle)] text-xs text-[var(--muted)]">
          <tr>
            <th className="w-16 px-4 py-3 font-semibold">Row</th>
            <th className="px-4 py-3 font-semibold">Attendee</th>
            <th className="px-4 py-3 font-semibold">Email</th>
            <th className="px-4 py-3 font-semibold">Attended?</th>
            <th className="w-32 px-4 py-3 font-semibold">Validation</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--border)] bg-white">
          {rows.map((row) => (
            <tr
              className={`align-top ${row.attended ? "bg-[var(--success-bg)]/40" : ""}`}
              key={row.rowNumber}
            >
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
              <td className="px-4 py-3.5">
                <span
                  className={`inline-flex rounded-md px-2.5 py-1 text-xs font-semibold ${
                    row.attended
                      ? "bg-[var(--success-bg)] text-[var(--success-text)]"
                      : "bg-[var(--subtle)] text-[var(--muted)]"
                  }`}
                >
                  {row.attended ? "Attended" : "Not attended"}
                </span>
                <span className="mt-1 block text-[11px] leading-4 text-[var(--muted)]">
                  {row.status}
                </span>
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

function SessionEventsSummaryView({
  summary,
}: {
  summary: ReturnType<typeof summarizeSessionEvents>;
}) {
  return (
    <div className="mt-4 rounded-lg border border-[var(--border)] bg-[var(--subtle)] p-4">
      <h3 className="text-sm font-semibold text-[var(--ink)]">
        Total attended across saved events
      </h3>
      <p className="mt-1 text-2xl font-semibold tracking-[-0.02em] text-[var(--ink)]">
        {summary.attendedCount}
      </p>
      <p className="text-xs text-[var(--muted)]">
        {summary.attendedCount} attended of {summary.sourceRowCount} rows across{" "}
        {summary.eventCount} {summary.eventCount === 1 ? "event" : "events"}
      </p>
    </div>
  );
}
