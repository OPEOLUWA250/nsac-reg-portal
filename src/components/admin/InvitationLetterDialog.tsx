"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Alert, Button, Field, cx, describedBy, inputClass, linkClass } from "@/components/ui";
import { IconClose } from "@/components/icons";
import { useAdmin } from "@/components/admin/AdminContext";
import { formatDateTime } from "@/lib/admin-format";
import { LETTER_LIMITS, parseLetterInput, type LetterFieldErrors, type LetterLanguage } from "@/lib/invitation-letter";
import type { Attendee } from "@/lib/types";

// "Send email" for someone who asked for an invitation letter. The letter is
// filled in from their registration; the admin adds the sender's email (where
// replies go) and who signs it, checks the letter and the email side by side,
// and only then sends it. Nothing is ever sent without this step.

interface Draft {
  senderEmail: string;
  signatoryName: string;
  signatoryTitle: string;
  passportNumber: string;
  language: LetterLanguage;
  copyToSender: boolean;
}

interface Preview {
  to: string;
  subject: string;
  html: string;
  pages: string[];
  filename: string;
}

// The sender and signatory are remembered in this browser for the next letter.
const REMEMBER = "nsac.invitation-letter.sender";
type Remembered = Pick<Draft, "senderEmail" | "signatoryName" | "signatoryTitle">;

function remembered(): Partial<Remembered> {
  try {
    return JSON.parse(window.localStorage.getItem(REMEMBER) ?? "{}") as Partial<Remembered>;
  } catch {
    return {};
  }
}

function remember(d: Draft) {
  try {
    window.localStorage.setItem(REMEMBER, JSON.stringify({ senderEmail: d.senderEmail, signatoryName: d.signatoryName, signatoryTitle: d.signatoryTitle }));
  } catch {
    /* private window: they'll type it again next time */
  }
}

export default function InvitationLetterDialog({
  attendee: a,
  onSent,
  onClose,
  onPassport,
}: {
  attendee: Attendee;
  /** After sending: the updated registration (when it could be recorded) and what to tell the admin. */
  onSent: (updated: Attendee | null, message: string) => void;
  onClose: () => void;
  /** Opens their passport, to read the number (super admins). */
  onPassport?: () => void;
}) {
  const { apiCall, me } = useAdmin();
  const dialog = useRef<HTMLDialogElement>(null);
  const first = useRef<HTMLInputElement>(null);
  const id = useId();
  const [draft, setDraft] = useState<Draft>(() => {
    const saved = remembered();
    return {
      senderEmail: saved.senderEmail ?? me?.email ?? "",
      signatoryName: saved.signatoryName ?? "",
      signatoryTitle: saved.signatoryTitle ?? "",
      passportNumber: "",
      language: a.language === "fr" ? "fr" : "en",
      copyToSender: true,
    };
  });
  const [tab, setTab] = useState<"letter" | "email">("letter");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(false);
  const [previewError, setPreviewError] = useState("");
  const [tried, setTried] = useState(false);
  const [serverFields, setServerFields] = useState<LetterFieldErrors>({});
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");

  useEffect(() => {
    const element = dialog.current!;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.documentElement.style.overflow;
    element.showModal();
    first.current?.focus();
    document.documentElement.style.overflow = "hidden";
    return () => {
      element.close();
      document.documentElement.style.overflow = overflow;
      if (previous?.isConnected) previous.focus();
    };
  }, []);

  const parsed = parseLetterInput({ ...draft });
  const fields: LetterFieldErrors = "fields" in parsed ? parsed.fields : serverFields;
  // Mistakes in what was typed show at once; empty required fields once they try to send.
  const shown = (k: keyof LetterFieldErrors) => (tried || String(draft[k as keyof Draft] ?? "").trim() ? fields[k] : undefined) || undefined;
  const missing = !draft.senderEmail.trim() || !draft.signatoryName.trim();

  // Redraw the preview a moment after typing stops.
  const request = useRef(0);
  const valid = "value" in parsed;
  const key = JSON.stringify(draft);
  useEffect(() => {
    if (!valid) return;
    const n = ++request.current;
    const timer = setTimeout(async () => {
      setLoading(true);
      setPreviewError("");
      try {
        const json = (await apiCall("/api/admin/invitation-letter", {
          method: "POST",
          body: JSON.stringify({ id: a.id, action: "preview", ...JSON.parse(key) }),
        })) as unknown as Preview;
        if (n === request.current) setPreview(json);
      } catch (err) {
        if (n !== request.current) return;
        setPreviewError(err instanceof Error ? err.message : "Couldn't draw the preview.");
        setServerFields((err as { body?: { fields?: LetterFieldErrors } }).body?.fields ?? {});
      } finally {
        if (n === request.current) setLoading(false);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [key, valid, a.id, apiCall]);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => {
    setDraft((d) => ({ ...d, [k]: v }));
    setServerFields({});
  };

  async function send() {
    setTried(true);
    setSendError("");
    if (!valid || !preview) {
      const firstBad = (["senderEmail", "signatoryName", "signatoryTitle", "passportNumber"] as const).find((k) => fields[k]);
      if (firstBad) document.getElementById(`${id}-${firstBad}`)?.focus();
      return;
    }
    setSending(true);
    try {
      const json = (await apiCall("/api/admin/invitation-letter", {
        method: "POST",
        body: JSON.stringify({ id: a.id, action: "send", ...draft }),
      })) as unknown as { recorded: boolean; warning?: string; attendee?: Attendee };
      remember(draft);
      onSent(json.attendee ?? null, json.warning ?? `Invitation letter emailed to ${a.email}.`);
      onClose();
    } catch (err) {
      setSendError(err instanceof Error ? err.message : "The email didn't send. Try again.");
      setServerFields((err as { body?: { fields?: LetterFieldErrors } }).body?.fields ?? {});
    } finally {
      setSending(false);
    }
  }

  const input = (k: "senderEmail" | "signatoryName" | "signatoryTitle" | "passportNumber", hint?: boolean) => ({
    id: `${id}-${k}`,
    value: draft[k],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => set(k, e.target.value),
    className: inputClass(!!shown(k)),
    disabled: sending,
    "aria-invalid": !!shown(k),
    "aria-describedby": describedBy(`${id}-${k}`, { hint, error: shown(k) }),
  });

  return (
    <dialog
      ref={dialog}
      aria-labelledby={`${id}-title`}
      aria-modal="true"
      className="fixed inset-0 m-auto h-[calc(100dvh-2rem)] max-h-none w-[calc(100%-2rem)] max-w-6xl overflow-hidden rounded-xl border border-line bg-surface p-0 text-ink shadow-2xl backdrop:bg-blue/60 backdrop:backdrop-blur-sm"
      onCancel={(e) => {
        e.preventDefault();
        if (!sending) onClose();
      }}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <form
        noValidate
        className="flex h-full flex-col"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <h2 id={`${id}-title`} className="font-display text-xl font-bold text-blue">
              Invitation letter for {a.full_name}
            </h2>
            <p className="truncate text-sm text-ink-3">
              To {a.email} · {a.nationality ?? "Nationality not given"}
            </p>
          </div>
          <button
            type="button"
            aria-label="Close without sending"
            disabled={sending}
            onClick={onClose}
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-ink-3 transition-colors duration-150 hover:bg-subtle disabled:opacity-50"
          >
            <IconClose />
          </button>
        </div>

        <div className="grid min-h-0 flex-1 overflow-y-auto md:grid-cols-[22rem_1fr] md:overflow-hidden">
          {/* The details the admin adds */}
          <div className="space-y-4 border-line p-5 sm:p-6 md:overflow-y-auto md:border-r">
            {a.invitation_letter_sent_at && (
              <Alert tone="info">
                Already sent {formatDateTime(a.invitation_letter_sent_at)}
                {a.invitation_letter_sent_by ? ` by ${a.invitation_letter_sent_by}` : ""}. Sending again emails them a new copy.
              </Alert>
            )}
            {!a.passport_path && <Alert tone="info">They haven&apos;t uploaded a passport. Check their details before sending.</Alert>}

            <Field id={`${id}-senderEmail`} label="Sender email" required hint="Replies go here, and the letter gives it as the contact." error={shown("senderEmail")}>
              <input ref={first} type="email" inputMode="email" autoComplete="email" maxLength={LETTER_LIMITS.email} {...input("senderEmail", true)} />
            </Field>
            <Field id={`${id}-signatoryName`} label="Signed by" required hint="The person whose name is under the letter." error={shown("signatoryName")}>
              <input autoComplete="name" maxLength={LETTER_LIMITS.name} {...input("signatoryName", true)} />
            </Field>
            <Field id={`${id}-signatoryTitle`} label="Their title" optionalLabel="optional" hint="Such as Conference Director." error={shown("signatoryTitle")}>
              <input maxLength={LETTER_LIMITS.title} {...input("signatoryTitle", true)} />
            </Field>
            <Field
              id={`${id}-passportNumber`}
              label="Passport number"
              optionalLabel="optional"
              hint={
                <>
                  Consulates match it with the visa application.
                  {a.passport_path && onPassport && (
                    <>
                      {" "}
                      <button type="button" onClick={onPassport} className={linkClass}>
                        View their passport
                      </button>
                    </>
                  )}
                </>
              }
              error={shown("passportNumber")}
            >
              <input autoComplete="off" spellCheck={false} autoCapitalize="characters" maxLength={LETTER_LIMITS.passport + 4} {...input("passportNumber", true)} />
            </Field>
            <Field id={`${id}-language`} label="Language">
              <select id={`${id}-language`} className={inputClass()} value={draft.language} disabled={sending} onChange={(e) => set("language", e.target.value as LetterLanguage)}>
                <option value="en">English</option>
                <option value="fr">French</option>
              </select>
            </Field>
            <label className="flex min-h-11 items-center gap-3 text-sm text-ink">
              <input type="checkbox" className="h-5 w-5 shrink-0" checked={draft.copyToSender} disabled={sending} onChange={(e) => set("copyToSender", e.target.checked)} />
              Send a hidden copy to the sender
            </label>
          </div>

          {/* What will be sent */}
          <section aria-label="Preview" className="flex min-h-[32rem] flex-col bg-canvas md:min-h-0">
            <div className="flex flex-wrap items-center gap-2 border-b border-line px-5 py-3 sm:px-6">
              {(
                [
                  ["letter", "Letter (PDF)"],
                  ["email", "Email"],
                ] as const
              ).map(([t, label]) => (
                <button
                  key={t}
                  type="button"
                  aria-pressed={tab === t}
                  onClick={() => setTab(t)}
                  className={cx(
                    "min-h-9 rounded-md border px-3 text-sm font-semibold transition-colors duration-150",
                    tab === t ? "border-blue bg-blue text-white" : "border-line-strong bg-surface text-ink-2 hover:bg-subtle"
                  )}
                >
                  {label}
                </button>
              ))}
              <p className="ml-auto text-sm text-ink-3" aria-live="polite">
                {loading ? "Updating the preview…" : preview && valid ? (tab === "email" ? preview.subject : preview.filename) : ""}
              </p>
            </div>
            <div className={cx("relative min-h-0 flex-1 overflow-y-auto p-4 transition-opacity duration-150 sm:p-6", loading && "opacity-60")}>
              {!valid ? (
                <p className="text-sm text-ink-3">
                  {missing ? "Fill in the sender email and who signs the letter to see it." : "Correct the highlighted field to see the letter."}
                </p>
              ) : previewError ? (
                <Alert tone="error">{previewError}</Alert>
              ) : !preview ? (
                <div aria-hidden="true" className="mx-auto aspect-[210/297] w-full max-w-2xl animate-pulse rounded-sm bg-subtle" />
              ) : tab === "letter" ? (
                <div className="mx-auto max-w-2xl space-y-4">
                  {preview.pages.map((src, i) => (
                    // eslint-disable-next-line @next/next/no-img-element -- a picture drawn by the server for this preview
                    <img key={i} src={src} alt={`Letter, page ${i + 1} of ${preview.pages.length}`} className="block w-full rounded-sm border border-line bg-white" />
                  ))}
                </div>
              ) : (
                <iframe title="Email preview" srcDoc={preview.html} sandbox="" className="mx-auto block h-full min-h-[36rem] w-full max-w-2xl rounded-sm border border-line bg-white" />
              )}
            </div>
          </section>
        </div>

        <div className="space-y-3 border-t border-line bg-canvas px-5 py-4 sm:px-6">
          {sendError && <Alert tone="error">{sendError}</Alert>}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <p className="text-sm text-ink-3 sm:mr-auto">
              Goes to <strong className="text-ink">{a.email}</strong>
              {draft.copyToSender && draft.senderEmail ? `, with a hidden copy to ${draft.senderEmail}` : ""}.
            </p>
            {/* Side by side on phones too, so the letter keeps the room. */}
            <div className="grid grid-cols-2 gap-3 sm:flex">
              <Button variant="outline" disabled={sending} onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" loading={sending} disabled={loading && !preview}>
                {sending ? "Sending…" : "Send email"}
              </Button>
            </div>
          </div>
        </div>
      </form>
    </dialog>
  );
}
