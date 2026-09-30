"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Alert, Button, Field, inputClass } from "@/components/ui";
import { IconAlert, IconClose } from "@/components/icons";

export default function DeleteDialog({ title, children, confirmLabel, confirmation, onConfirm, onClose }: {
  title: string;
  children: ReactNode;
  confirmLabel: string;
  confirmation?: string;
  onConfirm: () => Promise<void>;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const submitting = useRef(false);
  const id = useId();
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const element = dialog.current!;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.documentElement.style.overflow;
    element.showModal();
    cancel.current?.focus();
    document.documentElement.style.overflow = "hidden";
    return () => {
      element.close();
      document.documentElement.style.overflow = overflow;
      if (previous?.isConnected) previous.focus();
    };
  }, []);

  async function submit() {
    if (submitting.current || (confirmation && typed !== confirmation)) return;
    submitting.current = true;
    setBusy(true);
    setError("");
    try {
      await onConfirm();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't delete. Try again.");
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  return (
    <dialog
      ref={dialog}
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-description`}
      aria-modal="true"
      className="fixed inset-0 m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-xl border border-line bg-surface p-0 text-ink shadow-2xl backdrop:bg-blue/60 backdrop:backdrop-blur-sm"
      onCancel={(event) => { event.preventDefault(); if (!submitting.current) onClose(); }}
      onKeyDown={(event) => event.stopPropagation()}
      onClick={(event) => { if (event.target === event.currentTarget && !submitting.current) onClose(); }}
    >
      <form onSubmit={(event) => { event.preventDefault(); void submit(); }}>
        <div className="space-y-5 p-6 sm:p-7">
          <div className="flex items-start justify-between gap-4">
            <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-danger/10 text-danger"><IconAlert className="h-6 w-6" /></span>
            <button type="button" aria-label="Close confirmation" disabled={busy} onClick={onClose} className="inline-flex h-10 w-10 items-center justify-center rounded-md text-ink-3 hover:bg-subtle disabled:opacity-50"><IconClose /></button>
          </div>
          <div className="space-y-2">
            <h2 id={`${id}-title`} className="font-display text-xl font-bold text-blue">{title}</h2>
            <div id={`${id}-description`} className="space-y-2 text-sm leading-relaxed text-ink-2">{children}</div>
          </div>
          {confirmation && (
            <Field id={`${id}-confirm`} label={`Type ${confirmation} to confirm`}>
              <input id={`${id}-confirm`} className={inputClass()} value={typed} onChange={(event) => setTyped(event.target.value)} disabled={busy} autoComplete="off" spellCheck={false} autoCapitalize="off" />
            </Field>
          )}
          {error && <Alert tone="error">{error}</Alert>}
        </div>
        <div className="flex flex-col-reverse gap-3 border-t border-line bg-canvas px-6 py-4 sm:flex-row sm:justify-end sm:px-7">
          <Button ref={cancel} variant="outline" disabled={busy} onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="danger" loading={busy} disabled={Boolean(confirmation && typed !== confirmation)}>{busy ? "Deleting…" : confirmLabel}</Button>
        </div>
      </form>
    </dialog>
  );
}
