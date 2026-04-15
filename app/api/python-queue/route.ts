import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { getSession } from "@/lib/session";
import { getDropboxToken } from "@/lib/auth";
import { getPythonQueueDataForSession } from "@/lib/python-queue-ui";
import { countPythonManifestUploadsTodayUtc } from "@/lib/uploaded-videos";

export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest) {
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

    return new Response(
      JSON.stringify({
        ...summary,
        uploadsTodayUtc,
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
