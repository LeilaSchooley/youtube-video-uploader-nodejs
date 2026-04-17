import type { NextRequest } from "next/server";
import { handleUploadQueueGet } from "@/lib/upload-queue-route-get";
import { handleUploadQueuePost } from "@/lib/upload-queue-route-post";

export const dynamic = "force-dynamic";
export const maxDuration = 1800; // 30 minutes for large batches
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  return handleUploadQueuePost(request);
}

export async function GET() {
  return handleUploadQueueGet();
}
