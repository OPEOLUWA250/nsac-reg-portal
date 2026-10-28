"use client";

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Button, inputClass } from "@/components/ui";
import { IconAlert, IconClose, IconInfo } from "@/components/icons";

// The site's own pop-up, in place of the browser's alert(), confirm() and
// prompt(), which look like system warnings and can't be styled. A page calls
//   const { confirm, notify, popup } = usePopup();
//   if (!(await confirm({ title: "Remove Ada?", confirmLabel: "Remove", tone: "danger" }))) return;
// and renders {popup} somewhere in its output.

export interface PopupOptions {
  title: string;
  body?: ReactNode;
  /** The main button. "OK" for notify, "Continue" for confirm. */
  confirmLabel?: string;
  cancelLabel?: string;
  /** "danger" for something that can't be undone: red button and icon. */
  tone?: "default" | "danger";
  /** Text to copy by hand (shown selected), e.g. when the clipboard isn't allowed. */
  copyText?: string;
}

type Open = { kind: "confirm" | "notify"; options: PopupOptions; resolve: (ok: boolean) => void };

export function usePopup() {
  const [open, setOpen] = useState<Open | null>(null);

  const ask = useCallback(
    (kind: Open["kind"], options: PopupOptions) =>
      new Promise<boolean>((resolve) => {
        setOpen((current) => {
          current?.resolve(false); // a newer question replaces an unanswered one
          return { kind, options, resolve };
        });
      }),
    []
  );
  const confirm = useCallback((options: PopupOptions) => ask("confirm", options), [ask]);
  const notify = useCallback((options: PopupOptions) => ask("notify", options).then(() => undefined), [ask]);

  const popup = open ? (
    <PopupDialog
      key={open.options.title}
      kind={open.kind}
      {...open.options}
      onDone={(ok) => {
        open.resolve(ok);
        setOpen(null);
      }}
    />
  ) : null;

  return { confirm, notify, popup };
}

function PopupDialog({
  kind,
  title,
  body,
  confirmLabel = kind === "notify" ? "OK" : "Continue",
  cancelLabel = "Cancel",
  tone = "default",
  copyText,
  onDone,
}: PopupOptions & { kind: Open["kind"]; onDone: (ok: boolean) => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const main = useRef<HTMLButtonElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const copy = useRef<HTMLInputElement>(null);
  const id = useId();

  useEffect(() => {
    const element = dialog.current!;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.documentElement.style.overflow;
    element.showModal();
    // Something risky starts on Cancel; a notice or a question on its main button.
    if (copyText) copy.current?.select();
    else (tone === "danger" && kind === "confirm" ? cancel : main).current?.focus();
    document.documentElement.style.overflow = "hidden";
    return () => {
      element.close();
      document.documentElement.style.overflow = overflow;
      if (previous?.isConnected) previous.focus();
    };
  }, [copyText, kind, tone]);

  const danger = tone === "danger";
  return (
    <dialog
      ref={dialog}
      role={kind === "confirm" || danger ? "alertdialog" : "dialog"}
      aria-labelledby={`${id}-title`}
      aria-describedby={body ? `${id}-body` : undefined}
      aria-modal="true"
      className="fixed inset-0 m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-md overflow-y-auto rounded-lg border border-line bg-surface p-0 text-ink transition-opacity duration-150 backdrop:bg-blue/50 starting:opacity-0"
      onCancel={(event) => {
        event.preventDefault();
        onDone(false);
      }}
      onKeyDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        if (event.target === event.currentTarget) onDone(false);
      }}
    >
      <div className="space-y-4 p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <span aria-hidden="true" className={danger ? "mt-0.5 text-danger" : "mt-0.5 text-blue"}>
            {danger ? <IconAlert className="h-6 w-6" /> : <IconInfo className="h-6 w-6" />}
          </span>
          <h2 id={`${id}-title`} className="min-w-0 flex-1 font-display text-xl font-bold text-blue">
            {title}
          </h2>
          <button
            type="button"
            aria-label="Close"
            onClick={() => onDone(false)}
            className="-mr-2 -mt-2 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-ink-3 transition-colors duration-150 hover:bg-subtle"
          >
            <IconClose />
          </button>
        </div>
        {body && (
          <div id={`${id}-body`} className="space-y-2 text-sm leading-relaxed text-ink-2">
            {body}
          </div>
        )}
        {copyText && (
          <input ref={copy} readOnly aria-label="Text to copy" value={copyText} onFocus={(e) => e.currentTarget.select()} className={inputClass(false, "font-mono")} />
        )}
      </div>
      <div className="flex flex-col-reverse gap-3 border-t border-line bg-canvas px-5 py-4 sm:flex-row sm:justify-end sm:px-6">
        {kind === "confirm" && (
          <Button ref={cancel} variant="outline" onClick={() => onDone(false)}>
            {cancelLabel}
          </Button>
        )}
        <Button ref={main} variant={danger ? "danger" : "secondary"} onClick={() => onDone(true)}>
          {confirmLabel}
        </Button>
      </div>
    </dialog>
  );
}
