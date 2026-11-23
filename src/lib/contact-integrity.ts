/** Non-destructive normalizations for contacts written by older CardFlow builds. */
export function normalizeStoredContact(record: Record<string, unknown>): Record<string, unknown> {
  return {
    ...record,
    revision: record.revision == null ? 0 : record.revision,
    preview: record.preview == null ? '' : record.preview,
    backPreview: record.backPreview == null ? undefined : record.backPreview,
    sourceName: record.sourceName == null ? '' : record.sourceName,
    createdAt: record.createdAt instanceof Date ? record.createdAt.toISOString() : record.createdAt,
    reviewedAt: record.reviewedAt instanceof Date ? record.reviewedAt.toISOString() : record.reviewedAt,
  };
}

/** Verify that a successful cloud response contains every locally acknowledged ID. */
export function missingCloudContactIds(
  acknowledged: ReadonlyArray<{ id: string }>,
  cloud: ReadonlyArray<{ id: string }>,
): string[] {
  const ids = new Set(cloud.map(card => card.id));
  return acknowledged.filter(card => !ids.has(card.id)).map(card => card.id);
}
