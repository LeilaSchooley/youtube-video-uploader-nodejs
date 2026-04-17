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

export type DropboxAuthContextValue = {
  hasDropboxAuth: boolean | null;
  dropboxAuthLoading: boolean;
  connectDropbox: () => Promise<void>;
  disconnectDropbox: () => Promise<void>;
};

const DropboxAuthContext = createContext<DropboxAuthContextValue | null>(
  null,
);

export function useDropboxAuth(): DropboxAuthContextValue {
  const ctx = useContext(DropboxAuthContext);
  if (!ctx) {
    throw new Error("useDropboxAuth must be used within DropboxAuthProvider");
  }
  return ctx;
}

export function DropboxAuthProvider({
  children,
  onToast,
}: {
  children: ReactNode;
  onToast?: (t: Toast) => void;
}) {
  const [hasDropboxAuth, setHasDropboxAuth] = useState<boolean | null>(null);
  const [dropboxAuthLoading, setDropboxAuthLoading] = useState(true);
  const searchParams = useSearchParams();
  const router = useRouter();

  useEffect(() => {
    const fromDropboxCallback =
      typeof window !== "undefined" &&
      searchParams.get("dropbox_connected") === "1";
    if (fromDropboxCallback && typeof window !== "undefined") {
      localStorage.removeItem(DASHBOARD_STORAGE.hasDropboxAuth);
      setHasDropboxAuth(null);
    }

    if (typeof window !== "undefined" && !fromDropboxCallback) {
      const cached = localStorage.getItem(DASHBOARD_STORAGE.hasDropboxAuth);
      if (cached !== null) {
        setHasDropboxAuth(cached === "true");
      }
    }

    const checkDropboxAuth = async () => {
      try {
        const response = await fetch("/api/user", {
          credentials: "include",
        });
        const data = await response.json();
        const hasAuth = response.ok && data.hasDropbox;
        setHasDropboxAuth(hasAuth);
        if (typeof window !== "undefined") {
          localStorage.setItem(
            DASHBOARD_STORAGE.hasDropboxAuth,
            hasAuth ? "true" : "false",
          );
        }
        if (fromDropboxCallback && typeof window !== "undefined") {
          router.replace("/dashboard", { scroll: false });
        }
      } catch {
        setHasDropboxAuth(false);
        if (typeof window !== "undefined") {
          localStorage.setItem(DASHBOARD_STORAGE.hasDropboxAuth, "false");
        }
      } finally {
        setDropboxAuthLoading(false);
      }
    };
    void checkDropboxAuth();
  }, [searchParams, router]);

  const connectDropbox = useCallback(async () => {
    try {
      const response = await fetch("/api/auth/dropbox/url", {
        credentials: "include",
      });
      const data = await response.json();
      if (response.ok && data.url) {
        window.location.href = data.url;
      } else {
        onToast?.({
          message: data.error || "Failed to get Dropbox auth URL",
          type: "error",
        });
      }
    } catch {
      onToast?.({ message: "Failed to connect Dropbox", type: "error" });
    }
  }, [onToast]);

  const disconnectDropbox = useCallback(async () => {
    try {
      const response = await fetch("/api/auth/dropbox/disconnect", {
        method: "POST",
        credentials: "include",
      });
      const data = await response.json().catch(() => ({}));
      if (response.ok) {
        setHasDropboxAuth(false);
        if (typeof window !== "undefined") {
          localStorage.setItem(DASHBOARD_STORAGE.hasDropboxAuth, "false");
        }
        onToast?.({ message: "Dropbox disconnected", type: "success" });
      } else {
        onToast?.({
          message:
            (data as { error?: string }).error ||
            "Failed to disconnect Dropbox",
          type: "error",
        });
      }
    } catch {
      onToast?.({ message: "Failed to disconnect Dropbox", type: "error" });
    }
  }, [onToast]);

  const value = useMemo(
    () => ({
      hasDropboxAuth,
      dropboxAuthLoading,
      connectDropbox,
      disconnectDropbox,
    }),
    [hasDropboxAuth, dropboxAuthLoading, connectDropbox, disconnectDropbox],
  );

  return (
    <DropboxAuthContext.Provider value={value}>
      {children}
    </DropboxAuthContext.Provider>
  );
}
