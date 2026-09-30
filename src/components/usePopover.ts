"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Open/close state for a small menu anchored to a button: Escape and a
 * click outside close it, focus moves into it on open and back to the
 * button on Escape.
 */
export function usePopover<T extends HTMLElement = HTMLDivElement>(onClose?: () => void) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<T>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const closeRef = useRef(onClose);

  useEffect(() => {
    closeRef.current = onClose;
  });

  useEffect(() => {
    if (!open) return;
    wrap.current?.querySelector<HTMLElement>("[data-autofocus], [role=dialog] a, [role=dialog] button")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        trigger.current?.focus();
      }
    };
    const onDown = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
      closeRef.current?.();
    };
  }, [open]);

  return { open, setOpen, wrap, trigger };
}
