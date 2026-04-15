import { cookies } from "next/headers";
import { getSession } from "@/lib/session";
import { setWorkerPaused } from "@/lib/worker-pause";

export const dynamic = "force-dynamic";

export async function POST() {
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

    setWorkerPaused(false);
    return new Response(
      JSON.stringify({
        success: true,
        message:
          "Worker processing resumed (pause flag cleared). The worker process must still be running (e.g. pm2 start bulk-upload-worker).",
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
