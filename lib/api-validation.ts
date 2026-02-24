/**
 * Centralized API request validation using Zod.
 * Use parseOr400 to validate and return 400 with errors on failure.
 */

import { z } from "zod";
import { NextResponse } from "next/server";

export const privacyStatusSchema = z.enum(["public", "private", "unlisted"]);

export const queueManageBodySchema = z.object({
  jobId: z.string().optional(),
  action: z.enum([
    "pause",
    "resume",
    "cancel",
    "delete",
    "delete-all",
    "delete-all-jobs",
    "retry-failed",
  ]),
});

export const uploadDropboxBodySchema = z.object({
  dropboxFolderPath: z.string().min(1, "dropboxFolderPath is required"),
  recursive: z.boolean().optional().default(false),
  postUploadAction: z.enum(["rename", "delete", "move", "none"]).optional().default("none"),
  completedFolderPath: z.string().optional(),
  privacyStatus: privacyStatusSchema.optional().default("public"),
  videosPerDay: z.number().int().min(0).optional(),
  useWorker: z.boolean().optional().default(true),
  dropboxCsvPath: z.string().optional(),
  dropboxSheetName: z.string().optional(),
  dropboxThumbnailsFolderPath: z.string().optional(),
  skipDuplicateTitles: z.boolean().optional().default(true),
});

export const exportJobQuerySchema = z.object({
  jobId: z.string().min(1, "jobId is required"),
  format: z.enum(["json", "csv"]).optional().default("json"),
});

/**
 * Parse JSON body with schema; return NextResponse 400 on failure.
 */
export function parseBodyOr400<T>(
  body: unknown,
  schema: z.ZodSchema<T>,
): T | NextResponse {
  const result = schema.safeParse(body);
  if (result.success) return result.data;
  return NextResponse.json(
    {
      error: "Validation failed",
      details: result.error.flatten().fieldErrors,
    },
    { status: 400 },
  );
}

/**
 * Parse query params with schema; return NextResponse 400 on failure.
 */
export function parseQueryOr400<T>(
  searchParams: URLSearchParams,
  schema: z.ZodSchema<T>,
): T | NextResponse {
  const obj = Object.fromEntries(searchParams.entries());
  const result = schema.safeParse(obj);
  if (result.success) return result.data;
  return NextResponse.json(
    {
      error: "Validation failed",
      details: result.error.flatten().fieldErrors,
    },
    { status: 400 },
  );
}
