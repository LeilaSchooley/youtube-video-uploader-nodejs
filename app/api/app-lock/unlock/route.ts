import { NextRequest, NextResponse } from "next/server";
import {
  APP_LOCK_COOKIE,
  APP_LOCK_COOKIE_VALUE,
  isAppLockEnabled,
  isAppLockPasswordValid,
  sanitizeRedirectPath,
} from "@/lib/app-lock";

export async function POST(request: NextRequest) {
  if (!isAppLockEnabled()) {
    return NextResponse.json({ ok: true, disabled: true, redirectTo: "/dashboard" });
  }

  let password = "";
  let nextPath = "/dashboard";
  const contentType = request.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    const body = (await request.json().catch(() => ({}))) as {
      password?: string;
      next?: string;
    };
    password = typeof body.password === "string" ? body.password : "";
    nextPath = sanitizeRedirectPath(body.next);
  } else {
    const formData = await request.formData().catch(() => null);
    if (formData) {
      const p = formData.get("password");
      const n = formData.get("next");
      password = typeof p === "string" ? p : "";
      nextPath = sanitizeRedirectPath(typeof n === "string" ? n : undefined);
    }
  }

  if (!isAppLockPasswordValid(password)) {
    return NextResponse.json({ error: "Invalid password" }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true, redirectTo: nextPath });
  response.cookies.set({
    name: APP_LOCK_COOKIE,
    value: APP_LOCK_COOKIE_VALUE,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
  return response;
}
