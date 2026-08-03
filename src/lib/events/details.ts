import type { AttendanceImportResult } from "@/types/import";
import type { EventDetails } from "@/types/event";

export const EMPTY_EVENT_DETAILS: EventDetails = {
  name: "",
  eventUrl: "",
  instagramUrl: "",
  startDate: "",
  endDate: "",
};

export function fillEventDetailsFromImport(
  currentDetails: EventDetails,
  result: AttendanceImportResult,
): EventDetails {
  if (result.source !== "engage") {
    return currentDetails;
  }

  const { metadata } = result.data;

  return {
    ...currentDetails,
    name: currentDetails.name || metadata.name || "",
    startDate: currentDetails.startDate || metadata.startDate || "",
    endDate: currentDetails.endDate || metadata.endDate || "",
  };
}
