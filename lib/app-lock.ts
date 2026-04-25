export const APP_LOCK_COOKIE = "app_lock";
export const APP_LOCK_COOKIE_VALUE = "1";

export function isAppLockEnabled(): boolean {
  const password = process.env.APP_LOCK_PASSWORD;
  return typeof password === "string" && password.length > 0;
}

export function isAppLockPasswordValid(input: string): boolean {
  const password = process.env.APP_LOCK_PASSWORD;
  if (!password) return true;
  return input === password;
}

export function sanitizeRedirectPath(pathname: string | null | undefined): string {
  if (!pathname || typeof pathname !== "string") return "/dashboard";
  if (!pathname.startsWith("/") || pathname.startsWith("//")) return "/dashboard";
  if (pathname.startsWith("/unlock") || pathname.startsWith("/api/app-lock")) return "/dashboard";
  return pathname;
}
