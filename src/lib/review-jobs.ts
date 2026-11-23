/** Track duplicate-review decisions without coupling persistent contacts to transient upload jobs. */
export function resolveReviewJob(reviewJobIds: Map<string, number>, candidateId: string): number | null {
  const jobId = reviewJobIds.get(candidateId);
  if (jobId === undefined) return null; // Review persisted from an earlier page session.
  reviewJobIds.delete(candidateId);
  for (const pendingJobId of reviewJobIds.values()) {
    if (pendingJobId === jobId) return null; // Other cards in this upload still need review.
  }
  return jobId;
}
