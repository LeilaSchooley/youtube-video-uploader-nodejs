"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { Toaster } from "sonner";
import { AppToastProvider } from "./app-toast-context";

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            retry: 1,
            refetchOnWindowFocus: true,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <AppToastProvider>
        {children}
        <Toaster
          richColors
          position="top-center"
          closeButton
          duration={5000}
        />
      </AppToastProvider>
    </QueryClientProvider>
  );
}
