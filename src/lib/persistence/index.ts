import type { EventDetails, SessionEventRecord } from "@/types/event";
import type { RowResolution } from "@/types/import";

import * as supabaseEvents from "./supabaseEvents";

// Supabase is now the only persistence — local IndexedDB removed per request.
// Keep this thin index so imports stay `from "@/lib/persistence"` if we later add helpers.

export function loadEventRecords(): Promise<SessionEventRecord[]> {
  return supabaseEvents.loadEventRecords();
}

export function saveEventRecord(record: SessionEventRecord): Promise<void> {
  return supabaseEvents.saveEventRecord(record);
}

export function updateEventDetails(
  eventId: string,
  details: EventDetails,
): Promise<void> {
  return supabaseEvents.updateEventDetails(eventId, details);
}

export function resolveEventRow(
  input: supabaseEvents.ResolveEventRowInput,
): Promise<RowResolution> {
  return supabaseEvents.resolveEventRow(input);
}

export function deleteEventRecord(eventId: string): Promise<void> {
  return supabaseEvents.deleteEventRecord(eventId);
}

export function clearEventRecords(): Promise<void> {
  return supabaseEvents.clearEventRecords();
}

export type { SessionEventRecord } from "@/types/event";
export type { ResolveEventRowInput } from "./supabaseEvents";
