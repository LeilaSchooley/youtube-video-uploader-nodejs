"use client";

import { useState, useCallback } from "react";

export interface ConfirmModalState {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "default";
  resolve?: (value: boolean) => void;
}

const initial: ConfirmModalState = {
  open: false,
  title: "",
  message: "",
};

export function useConfirmModal() {
  const [confirmModal, setConfirmModal] = useState<ConfirmModalState>(initial);

  const requestConfirm = useCallback(
    (opts: {
      title: string;
      message: string;
      confirmLabel?: string;
      cancelLabel?: string;
      variant?: "danger" | "default";
    }) =>
      new Promise<boolean>((resolve) => {
        setConfirmModal({
          open: true,
          title: opts.title,
          message: opts.message,
          confirmLabel: opts.confirmLabel,
          cancelLabel: opts.cancelLabel,
          variant: opts.variant,
          resolve,
        });
      }),
    [],
  );

  const closeConfirmModal = useCallback((value: boolean) => {
    setConfirmModal((prev) => {
      prev.resolve?.(value);
      return { ...prev, open: false, resolve: undefined };
    });
  }, []);

  return { confirmModal, requestConfirm, closeConfirmModal };
}
