import { NextRequest, NextResponse } from "next/server";
import {
  APP_LOCK_COOKIE,
  APP_LOCK_COOKIE_VALUE,
  isAppLockEnabled,
} from "@/lib/app-lock";

function isPublicPath(pathname: string): boolean {
  if (pathname === "/unlock") return true;
  if (pathname.startsWith("/api/app-lock/unlock")) return true;
  if (pathname.startsWith("/_next")) return true;
  if (pathname === "/favicon.ico") return true;
  if (pathname === "/robots.txt") return true;
  if (pathname === "/sitemap.xml") return true;
  return false;
}

export function middleware(request: NextRequest) {
  if (!isAppLockEnabled()) {
    return NextResponse.next();
  }

  const { pathname, search } = request.nextUrl;

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  const isUnlocked = request.cookies.get(APP_LOCK_COOKIE)?.value === APP_LOCK_COOKIE_VALUE;
  if (isUnlocked) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "App is locked" }, { status: 423 });
  }

  const url = request.nextUrl.clone();
  const returnTo = `${pathname}${search || ""}`;
  url.pathname = "/unlock";
  url.search = `?next=${encodeURIComponent(returnTo)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
