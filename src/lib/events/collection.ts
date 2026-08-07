import type { SessionEventRecord } from "@/types/event";

interface EventCollectionAfterDeletion {
  records: SessionEventRecord[];
  selectedEventId: string | null;
}

export function removeEventFromCollection(
  records: SessionEventRecord[],
  eventId: string,
  selectedEventId: string | null,
): EventCollectionAfterDeletion {
  const remainingRecords = records.filter((record) => record.id !== eventId);

  return {
    records: remainingRecords,
    selectedEventId:
      selectedEventId === eventId
        ? (remainingRecords.at(-1)?.id ?? null)
        : selectedEventId,
  };
}
