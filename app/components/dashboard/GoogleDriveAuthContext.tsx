"use client";

import { DASHBOARD_STORAGE } from "@/lib/dashboard-storage-keys";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";

type Toast = { message: string; type: "success" | "error" | "info" };

export type GoogleDriveAuthContextValue = {
  hasGoogleDriveAuth: boolean | null;
  driveAuthLoading: boolean;
  connectGoogleDrive: () => Promise<void>;
  disconnectGoogleDrive: () => Promise<void>;
};

const GoogleDriveAuthContext = createContext<GoogleDriveAuthContextValue | null>(
  null,
);

export function useGoogleDriveAuth(): GoogleDriveAuthContextValue {
  const ctx = useContext(GoogleDriveAuthContext);
  if (!ctx) {
    throw new Error(
      "useGoogleDriveAuth must be used within GoogleDriveAuthProvider",
    );
  }
  return ctx;
}

export function GoogleDriveAuthProvider({
  children,
  onToast,
}: {
  children: ReactNode;
  onToast?: (t: Toast) => void;
}) {
  const [hasGoogleDriveAuth, setHasGoogleDriveAuth] = useState<boolean | null>(
    null,
  );
  const [driveAuthLoading, setDriveAuthLoading] = useState(true);
  const searchParams = useSearchParams();
  const router = useRouter();

  useEffect(() => {
    const fromDriveCallback =
      typeof window !== "undefined" &&
      searchParams.get("drive_connected") === "1";
    if (fromDriveCallback && typeof window !== "undefined") {
      localStorage.removeItem(DASHBOARD_STORAGE.hasGoogleDriveAuth);
      setHasGoogleDriveAuth(null);
    }

    if (typeof window !== "undefined" && !fromDriveCallback) {
      const cached = localStorage.getItem(DASHBOARD_STORAGE.hasGoogleDriveAuth);
      if (cached !== null) {
        setHasGoogleDriveAuth(cached === "true");
      }
    }

    const check = async () => {
      try {
        const response = await fetch("/api/user", { credentials: "include" });
        const data = await response.json();
        const hasAuth = response.ok && data.hasGoogleDrive;
        setHasGoogleDriveAuth(hasAuth);
        if (typeof window !== "undefined") {
          localStorage.setItem(
            DASHBOARD_STORAGE.hasGoogleDriveAuth,
            hasAuth ? "true" : "false",
          );
        }
        if (fromDriveCallback && typeof window !== "undefined") {
          router.replace("/dashboard", { scroll: false });
        }
      } catch {
        setHasGoogleDriveAuth(false);
        if (typeof window !== "undefined") {
          localStorage.setItem(DASHBOARD_STORAGE.hasGoogleDriveAuth, "false");
        }
      } finally {
        setDriveAuthLoading(false);
      }
    };
    void check();
  }, [searchParams, router]);

  const connectGoogleDrive = useCallback(async () => {
    try {
      const response = await fetch("/api/auth/drive/url", {
        credentials: "include",
      });
      const data = await response.json();
      if (response.ok && data.url) {
        window.location.href = data.url;
      } else {
        onToast?.({
          message: data.error || "Failed to get Google Drive auth URL",
          type: "error",
        });
      }
    } catch {
      onToast?.({ message: "Failed to connect Google Drive", type: "error" });
    }
  }, [onToast]);

  const disconnectGoogleDrive = useCallback(async () => {
    try {
      const response = await fetch("/api/auth/drive/disconnect", {
        method: "POST",
        credentials: "include",
      });
      const data = await response.json().catch(() => ({}));
      if (response.ok) {
        setHasGoogleDriveAuth(false);
        if (typeof window !== "undefined") {
          localStorage.setItem(DASHBOARD_STORAGE.hasGoogleDriveAuth, "false");
        }
        onToast?.({ message: "Google Drive disconnected", type: "success" });
      } else {
        onToast?.({
          message:
            (data as { error?: string }).error ||
            "Failed to disconnect Google Drive",
          type: "error",
        });
      }
    } catch {
      onToast?.({ message: "Failed to disconnect Google Drive", type: "error" });
    }
  }, [onToast]);

  const value = useMemo(
    () => ({
      hasGoogleDriveAuth,
      driveAuthLoading,
      connectGoogleDrive,
      disconnectGoogleDrive,
    }),
    [
      hasGoogleDriveAuth,
      driveAuthLoading,
      connectGoogleDrive,
      disconnectGoogleDrive,
    ],
  );

  return (
    <GoogleDriveAuthContext.Provider value={value}>
      {children}
    </GoogleDriveAuthContext.Provider>
  );
}
