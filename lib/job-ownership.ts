/**
 * Same visibility rule as GET /api/upload-queue: job belongs to the viewer if
 * the session cookie matches OR the Google user id matches.
 *
 * (Stricter AND-only checks caused "delete all" to delete 0 jobs while the UI
 * still listed jobs — e.g. stale userId on disk but valid sessionId.)
 */
export function jobBelongsToViewer(
  job: { userId?: string; sessionId: string },
  viewerUserId: string | undefined,
  viewerSessionId: string | undefined,
): boolean {
  const sessionOk =
    !!viewerSessionId && job.sessionId === viewerSessionId;
  const userOk =
    !!viewerUserId &&
    viewerUserId.length > 0 &&
    job.userId != null &&
    String(job.userId).length > 0 &&
    job.userId === viewerUserId;
  return sessionOk || userOk;
}
