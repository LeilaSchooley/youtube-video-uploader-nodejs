import { cookies } from "next/headers";
import { getSession } from "@/lib/session";
import { getDropboxToken } from "@/lib/auth";
import { getPythonQueueDataForSession } from "@/lib/python-queue-ui";
import { readWorkerUploadSchedule } from "@/lib/server-upload-schedule";
import { countPythonManifestUploadsTodayUtc, countPythonManifestShortsUploadedTodayUtc } from "@/lib/uploaded-videos";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const cookieStore = await cookies();
    const sessionId = cookieStore.get("sessionId")?.value;

    if (!sessionId) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const session = getSession(sessionId);
    if (!session || !session.authenticated) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const dropboxToken = await getDropboxToken(
      session.dropboxToken,
      session.dropboxRefreshToken,
      sessionId,
    );

    const summary = await getPythonQueueDataForSession(
      sessionId,
      dropboxToken,
      session.dropboxRefreshToken ?? null,
    );
    const uploadsTodayUtc = countPythonManifestUploadsTodayUtc();
    const shortsUploadedTodayUtc = countPythonManifestShortsUploadedTodayUtc();
    const sched = readWorkerUploadSchedule();
    const capNum = parseInt(sched.videosPerDay.trim(), 10);
    const manifestDailyLimit =
      sched.enabled && !Number.isNaN(capNum) && capNum > 0
        ? {
            enabled: true,
            videosPerDay: capNum,
            uploadsTodayUtc,
            remainingToday: Math.max(0, capNum - uploadsTodayUtc),
          }
        : null;

    return new Response(
      JSON.stringify({
        ...summary,
        uploadsTodayUtc,
        shortsUploadedTodayUtc,
        manifestDailyLimit,
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Error fetching python queue";
    console.error("[PYTHON-QUEUE API]", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
