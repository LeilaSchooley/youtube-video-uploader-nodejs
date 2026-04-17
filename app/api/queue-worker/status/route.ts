import { cookies } from "next/headers";
import { getSession } from "@/lib/session";
import { getDropboxToken } from "@/lib/auth";
import { getPythonQueueDataForSession } from "@/lib/python-queue-ui";
import { getQueueWorkerStatus } from "@/lib/queue-worker-status";
import { countPythonManifestUploadsTodayUtc } from "@/lib/uploaded-videos";

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
    const pythonSummary = await getPythonQueueDataForSession(
      sessionId,
      dropboxToken,
      session.dropboxRefreshToken ?? null,
    );
    const pythonWithUploads = {
      ...pythonSummary,
      uploadsTodayUtc: countPythonManifestUploadsTodayUtc(),
    };
    const payload = getQueueWorkerStatus(
      sessionId,
      session.userId,
      pythonWithUploads,
    );
    return new Response(JSON.stringify(payload), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
