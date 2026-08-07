import type { SessionEventRecord } from "@/types/event";

import * as supabaseEvents from "./supabaseEvents";

// Supabase is now the only persistence — local IndexedDB removed per request.
// Keep this thin index so imports stay `from "@/lib/persistence"` if we later add helpers.

export function loadEventRecords(): Promise<SessionEventRecord[]> {
  return supabaseEvents.loadEventRecords();
}

export function saveEventRecord(record: SessionEventRecord): Promise<void> {
  return supabaseEvents.saveEventRecord(record);
}

export function deleteEventRecord(eventId: string): Promise<void> {
  return supabaseEvents.deleteEventRecord(eventId);
}

export function clearEventRecords(): Promise<void> {
  return supabaseEvents.clearEventRecords();
}

export type { SessionEventRecord } from "@/types/event";
