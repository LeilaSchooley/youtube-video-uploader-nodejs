"use client";

import { useCallback, useRef, useState } from "react";

type PickerResult = { id: string; name: string };

type PickerMode = "file" | "folder";

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window {
    gapi?: { load: (name: string, opts: { callback: () => void }) => void };
    google?: { picker: any };
  }
}

let gapiScriptPromise: Promise<void> | null = null;

function loadGapiPicker(): Promise<void> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Picker only runs in the browser"));
  }
  if (window.google?.picker) {
    return Promise.resolve();
  }
  if (!gapiScriptPromise) {
    gapiScriptPromise = new Promise((resolve, reject) => {
      const existing = document.querySelector(
        'script[src="https://apis.google.com/js/api.js"]',
      );
      const onReady = () => {
        if (!window.gapi) {
          reject(new Error("Google API failed to load"));
          return;
        }
        window.gapi.load("picker", { callback: () => resolve() });
      };
      if (existing) {
        onReady();
        return;
      }
      const script = document.createElement("script");
      script.src = "https://apis.google.com/js/api.js";
      script.async = true;
      script.onload = onReady;
      script.onerror = () => reject(new Error("Failed to load Google API"));
      document.head.appendChild(script);
    });
  }
  return gapiScriptPromise;
}

export function useGoogleDrivePicker() {
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busyRef = useRef(false);

  const openPicker = useCallback(
    async (
      mode: PickerMode,
      onPick: (result: PickerResult) => void,
    ): Promise<boolean> => {
      if (busyRef.current) return false;
      busyRef.current = true;
      setOpening(true);
      setError(null);

      try {
        const res = await fetch("/api/drive-picker-config", {
          credentials: "include",
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || "Could not load Drive picker config");
        }
        if (!data.pickerConfigured || !data.accessToken) {
          throw new Error(
            "Google Picker is not configured. Set GOOGLE_DRIVE_API_KEY and GOOGLE_DRIVE_APP_ID, or reconnect Drive after a scope update.",
          );
        }

        await loadGapiPicker();
        const google = window.google;
        if (!google?.picker) {
          throw new Error("Google Picker failed to initialize");
        }

        const view = new google.picker.DocsView(google.picker.ViewId.DOCS);
        if (mode === "folder") {
          view.setIncludeFolders(true);
          view.setSelectFolderEnabled(true);
        } else {
          view.setMimeTypes("video/mp4,video/quicktime,video/x-msvideo,video/webm,video/x-matroska,video/mpeg");
        }

        return await new Promise<boolean>((resolve) => {
          const pickerApi = google.picker;
          const picker = new pickerApi.PickerBuilder()
            .addView(view)
            .setOAuthToken(data.accessToken)
            .setDeveloperKey(data.apiKey)
            .setAppId(data.appId)
            .setCallback((response: Record<string, unknown>) => {
              if (response[pickerApi.Response.ACTION] === pickerApi.Action.PICKED) {
                const docs = response[pickerApi.Response.DOCUMENTS] as Array<
                  Record<string, string>
                >;
                const doc = docs?.[0];
                const id = doc?.[pickerApi.Document.ID];
                const name = doc?.[pickerApi.Document.NAME];
                if (id) {
                  onPick({ id, name: name || id });
                  resolve(true);
                  return;
                }
              }
              resolve(false);
            })
            .build();
          picker.setVisible(true);
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
        return false;
      } finally {
        busyRef.current = false;
        setOpening(false);
      }
    },
    [],
  );

  return { openPicker, opening, error, clearError: () => setError(null) };
}
