"use client";

import {
  createContext,
  useCallback,
  useContext,
  type ReactNode,
} from "react";
import { toast } from "sonner";

export type AppToastPayload = {
  message: string;
  type: "success" | "error" | "info";
};

const AppToastContext = createContext<((t: AppToastPayload) => void) | null>(
  null,
);

export function AppToastProvider({ children }: { children: ReactNode }) {
  const showAppToast = useCallback((t: AppToastPayload) => {
    const duration =
      t.type === "error" || t.type === "info" ? 8000 : 5000;
    if (t.type === "success") toast.success(t.message, { duration });
    else if (t.type === "error") toast.error(t.message, { duration });
    else toast.info(t.message, { duration });
  }, []);

  return (
    <AppToastContext.Provider value={showAppToast}>
      {children}
    </AppToastContext.Provider>
  );
}

export function useAppToast(): (t: AppToastPayload) => void {
  const ctx = useContext(AppToastContext);
  if (!ctx) {
    throw new Error("useAppToast must be used within AppToastProvider");
  }
  return ctx;
}
