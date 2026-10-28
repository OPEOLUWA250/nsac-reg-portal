"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Alert, Button, Field, cx, describedBy, inputClass, linkClass } from "@/components/ui";
import { IconClose } from "@/components/icons";
import { useAdmin } from "@/components/admin/AdminContext";
import { usePopup } from "@/components/Popup";
import { relativeTime } from "@/lib/admin-format";
import {
  DEFAULT_TEMPLATES,
  parseReminderInput,
  PLACEHOLDERS,
  REMINDER_LIMITS,
  reminderLanguage,
  remindedRecently,
  type ReminderFieldErrors,
  type ReminderLanguage,
  type ReminderTemplate,
} from "@/lib/payment-reminder";
import type { Attendee } from "@/lib/types";

// "Send payment reminder", for one person (from their details) or for
// everyone awaiting payment (from the dashboard). The admin sets where
// replies go and who signs, can edit the message in English and French, and
// sees the email before sending. Each person gets it in their own language,
// with a button back to payment at today's price.

type Templates = Record<ReminderLanguage, ReminderTemplate>;

interface Draft {
  replyTo: string;
  signedBy: string;
  signerTitle: string;
  copyToSender: boolean;
  templates: Templates;
}

export type ReminderResult =
  | { id: string; status: "sent"; attendee: Attendee | null }
  | { id: string; status: "paid" | "closed" | "missing" | "failed"; error: string };

// The sender, signature and wording are remembered in this browser for next time.
const REMEMBER = "nsac.payment-reminder";

function remembered(): Partial<Draft> {
  try {
    return JSON.parse(window.localStorage.getItem(REMEMBER) ?? "{}") as Partial<Draft>;
  } catch {
    return {};
  }
}

function remember(d: Draft) {
  try {
    window.localStorage.setItem(REMEMBER, JSON.stringify(d));
  } catch {
    /* private window: they'll type it again next time */
  }
}

const LANGUAGE_NAME: Record<ReminderLanguage, string> = { en: "English", fr: "French" };
const sameTemplates = (a: Templates, b: Templates) => JSON.stringify(a) === JSON.stringify(b);

export default function PaymentReminderDialog({
  people,
  onSent,
  onClose,
}: {
  /** One person, or everyone awaiting payment (the admin picks who). */
  people: Attendee[];
  onSent: (results: ReminderResult[], recorded: boolean) => void;
  onClose: () => void;
}) {
  const { apiCall, me } = useAdmin();
  const { confirm, popup } = usePopup();
  const dialog = useRef<HTMLDialogElement>(null);
  const first = useRef<HTMLInputElement>(null);
  const id = useId();
  const single = people.length === 1 ? people[0] : null;

  const [draft, setDraft] = useState<Draft>(() => {
    const saved = remembered();
    return {
      replyTo: saved.replyTo ?? me?.email ?? "",
      signedBy: saved.signedBy ?? "",
      signerTitle: saved.signerTitle ?? "",
      copyToSender: saved.copyToSender ?? true,
      templates: saved.templates?.en && saved.templates?.fr ? saved.templates : DEFAULT_TEMPLATES,
    };
  });
  // One person: the language they get (their own by default). Several: the version being edited.
  const [language, setLanguage] = useState<ReminderLanguage>(single ? reminderLanguage(single) : "en");
  // Several people: who gets it. Anyone reminded in the last day starts unticked.
  const [chosen, setChosen] = useState<Set<string>>(() => new Set(people.filter((p) => single || !remindedRecently(p)).map((p) => p.id)));
  const [preview, setPreview] = useState<{ to: string; subject: string; html: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [previewError, setPreviewError] = useState("");
  const [tried, setTried] = useState(false);
  const [serverFields, setServerFields] = useState<ReminderFieldErrors>({});
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

  const recipients = useMemo(() => people.filter((p) => chosen.has(p.id)), [people, chosen]);
  // The preview shows someone who gets this language's version, if anyone does.
  const previewPerson = single ?? recipients.find((p) => reminderLanguage(p) === language) ?? recipients[0] ?? null;

  const parsed = parseReminderInput(draft);
  const fields: ReminderFieldErrors = "fields" in parsed ? parsed.fields : serverFields;
  const shown = (k: keyof ReminderFieldErrors) => (tried || k.includes(".") ? fields[k] : draft[k as "replyTo"]?.trim() ? fields[k] : undefined) || undefined;
  const valid = "value" in parsed;

  // Redraw the preview a moment after typing stops.
  const request = useRef(0);
  const key = JSON.stringify({ draft, language, person: previewPerson?.id });
  useEffect(() => {
    if (!valid || !previewPerson) return;
    const n = ++request.current;
    const timer = setTimeout(async () => {
      setLoading(true);
      setPreviewError("");
      try {
        const json = (await apiCall("/api/admin/payment-reminder", {
          method: "POST",
          body: JSON.stringify({ action: "preview", ids: [previewPerson.id], language, ...draft }),
        })) as unknown as { to: string; subject: string; html: string };
        if (n === request.current) setPreview(json);
      } catch (err) {
        if (n !== request.current) return;
        setPreviewError(err instanceof Error ? err.message : "Couldn't draw the preview.");
        setServerFields((err as { body?: { fields?: ReminderFieldErrors } }).body?.fields ?? {});
      } finally {
        if (n === request.current) setLoading(false);
      }
    }, 500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` holds everything the preview depends on
  }, [key, valid, apiCall]);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => {
    setDraft((d) => ({ ...d, [k]: v }));
    setServerFields({});
  };
  const setTemplate = (k: keyof ReminderTemplate, v: string) =>
    set("templates", { ...draft.templates, [language]: { ...draft.templates[language], [k]: v } });

  async function send() {
    setTried(true);
    setSendError("");
    if (!valid) {
      const firstBad = (["replyTo", "signedBy", "signerTitle"] as const).find((k) => fields[k]);
      if (firstBad) document.getElementById(`${id}-${firstBad}`)?.focus();
      else if (Object.keys(fields).some((k) => k.startsWith(language === "en" ? "fr" : "en"))) setLanguage(language === "en" ? "fr" : "en");
      return;
    }
    if (!recipients.length) {
      setSendError("Tick at least one person.");
      return;
    }
    const recent = recipients.filter((p) => remindedRecently(p));
    if (recent.length) {
      const ok = await confirm({
        title: single ? `${single.full_name} was reminded ${relativeTime(single.payment_reminder_sent_at!)}` : `${recent.length} of them were reminded in the last day`,
        body: single
          ? "Send another reminder anyway?"
          : `${recent.map((p) => p.full_name).join(", ")}. Send them another reminder anyway?`,
        confirmLabel: "Send anyway",
      });
      if (!ok) return;
    }
    setSending(true);
    try {
      const json = (await apiCall("/api/admin/payment-reminder", {
        method: "POST",
        body: JSON.stringify({ action: "send", ids: recipients.map((p) => p.id), ...(single ? { language } : {}), ...draft }),
      })) as unknown as { results: ReminderResult[]; recorded: boolean };
      remember(draft);
      onSent(json.results, json.recorded);
      onClose();
    } catch (err) {
      setSendError(err instanceof Error ? err.message : "The reminders didn't send. Try again.");
      setServerFields((err as { body?: { fields?: ReminderFieldErrors } }).body?.fields ?? {});
    } finally {
      setSending(false);
    }
  }

  const input = (k: "replyTo" | "signedBy" | "signerTitle", hint?: boolean) => ({
    id: `${id}-${k}`,
    value: draft[k],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => set(k, e.target.value),
    className: inputClass(!!shown(k)),
    disabled: sending,
    "aria-invalid": !!shown(k),
    "aria-describedby": describedBy(`${id}-${k}`, { hint, error: shown(k) }),
  });
  const byLanguage = { en: recipients.filter((p) => reminderLanguage(p) === "en").length, fr: recipients.filter((p) => reminderLanguage(p) === "fr").length };
  const edited = !sameTemplates(draft.templates, DEFAULT_TEMPLATES);

  return (
    <dialog
      ref={dialog}
      aria-labelledby={`${id}-title`}
      aria-modal="true"
      className="fixed inset-0 m-auto h-[calc(100dvh-2rem)] max-h-none w-[calc(100%-2rem)] max-w-6xl overflow-hidden rounded-lg border border-line bg-surface p-0 text-ink backdrop:bg-blue/50"
      onCancel={(e) => {
        e.preventDefault();
        if (!sending) onClose();
      }}
      onKeyDown={(e) => e.stopPropagation()}
    >
      {popup}
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
              {single ? `Payment reminder for ${single.full_name}` : "Remind everyone awaiting payment"}
            </h2>
            <p className="truncate text-sm text-ink-3">
              {single
                ? `To ${single.email} · registered ${relativeTime(single.created_at)}`
                : `${people.length} ${people.length === 1 ? "person has" : "people have"} filled in the form without paying.`}
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

        <div className="grid min-h-0 flex-1 overflow-y-auto md:grid-cols-[24rem_1fr] md:overflow-hidden">
          {/* What the admin sets */}
          <div className="space-y-4 border-line p-5 sm:p-6 md:overflow-y-auto md:border-r">
            {single?.payment_reminder_sent_at && (
              <Alert tone="info">
                Already reminded {relativeTime(single.payment_reminder_sent_at)}
                {(single.payment_reminder_count ?? 0) > 1 ? ` (${single.payment_reminder_count} reminders so far)` : ""}.
              </Alert>
            )}

            {!single && (
              <fieldset className="space-y-2">
                <legend className="text-sm font-semibold text-ink">Who gets it</legend>
                <div className="flex flex-wrap gap-x-4 text-sm">
                  <button type="button" className={linkClass} onClick={() => setChosen(new Set(people.map((p) => p.id)))} disabled={sending}>
                    Everyone
                  </button>
                  <button type="button" className={linkClass} onClick={() => setChosen(new Set())} disabled={sending}>
                    Nobody
                  </button>
                </div>
                <ul className="max-h-56 divide-y divide-line overflow-y-auto rounded-md border border-line">
                  {people.map((p) => (
                    <li key={p.id}>
                      <label className="flex min-h-11 cursor-pointer items-start gap-3 px-3 py-2 text-sm hover:bg-canvas">
                        <input
                          type="checkbox"
                          className="mt-0.5 h-5 w-5 shrink-0"
                          checked={chosen.has(p.id)}
                          disabled={sending}
                          onChange={(e) =>
                            setChosen((s) => {
                              const next = new Set(s);
                              if (e.target.checked) next.add(p.id);
                              else next.delete(p.id);
                              return next;
                            })
                          }
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-semibold text-ink">{p.full_name}</span>
                          <span className="block truncate text-ink-3">
                            {LANGUAGE_NAME[reminderLanguage(p)]} · registered {relativeTime(p.created_at)}
                            {p.payment_reminder_sent_at ? ` · reminded ${relativeTime(p.payment_reminder_sent_at)}` : ""}
                          </span>
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
                <p className="text-sm text-ink-3">People reminded in the last day start unticked.</p>
              </fieldset>
            )}

            <Field id={`${id}-replyTo`} label="Sender email" required hint="Replies go here. The email itself comes from the conference address." error={shown("replyTo")}>
              <input ref={first} type="email" inputMode="email" autoComplete="email" maxLength={REMINDER_LIMITS.email} {...input("replyTo", true)} />
            </Field>
            <Field id={`${id}-signedBy`} label="Signed by" optionalLabel="optional" hint="Your name under the message. Without it, it's signed by the conference team." error={shown("signedBy")}>
              <input autoComplete="name" maxLength={REMINDER_LIMITS.name} {...input("signedBy", true)} />
            </Field>
            {draft.signedBy.trim() && (
              <Field id={`${id}-signerTitle`} label="Their title" optionalLabel="optional" error={shown("signerTitle")}>
                <input maxLength={REMINDER_LIMITS.title} {...input("signerTitle")} />
              </Field>
            )}

            <div className="space-y-3 rounded-md border border-line p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-semibold text-ink">{single ? "Language" : "Message"}</span>
                <div role="group" aria-label={single ? "Language they get" : "Version to edit"} className="inline-flex overflow-hidden rounded-md border border-line-strong">
                  {(["en", "fr"] as const).map((l) => (
                    <button
                      key={l}
                      type="button"
                      aria-pressed={language === l}
                      onClick={() => setLanguage(l)}
                      className={cx(
                        "min-h-11 border-l border-line-strong px-3 text-sm font-semibold transition-colors duration-150 first:border-l-0 sm:min-h-9",
                        language === l ? "bg-blue text-white" : "bg-surface text-ink-2 hover:bg-subtle"
                      )}
                    >
                      {LANGUAGE_NAME[l]}
                      {!single && ` (${byLanguage[l]})`}
                    </button>
                  ))}
                </div>
              </div>
              {!single && <p className="text-sm text-ink-3">Each person gets the version in their language. Edit both if you change the wording.</p>}
              <Field id={`${id}-subject`} label="Subject" required error={shown(`${language}.subject`)}>
                <input
                  id={`${id}-subject`}
                  className={inputClass(!!shown(`${language}.subject`))}
                  value={draft.templates[language].subject}
                  maxLength={REMINDER_LIMITS.subject}
                  disabled={sending}
                  onChange={(e) => setTemplate("subject", e.target.value)}
                  aria-invalid={!!shown(`${language}.subject`)}
                  aria-describedby={describedBy(`${id}-subject`, { error: shown(`${language}.subject`) })}
                />
              </Field>
              <Field
                id={`${id}-message`}
                label="Message"
                required
                hint={`${PLACEHOLDERS.firstName}, ${PLACEHOLDERS.ticket} and ${PLACEHOLDERS.price} are filled in for each person. A blank line starts a new paragraph. The payment button and their ticket and price are added below it.`}
                error={shown(`${language}.message`)}
              >
                <textarea
                  id={`${id}-message`}
                  rows={10}
                  className={inputClass(!!shown(`${language}.message`), "min-h-56 text-base leading-relaxed")}
                  value={draft.templates[language].message}
                  maxLength={REMINDER_LIMITS.message}
                  disabled={sending}
                  onChange={(e) => setTemplate("message", e.target.value)}
                  aria-invalid={!!shown(`${language}.message`)}
                  aria-describedby={describedBy(`${id}-message`, { hint: true, error: shown(`${language}.message`) })}
                />
              </Field>
              {edited && (
                <button type="button" className={cx(linkClass, "text-sm")} disabled={sending} onClick={() => set("templates", DEFAULT_TEMPLATES)}>
                  Go back to the standard wording
                </button>
              )}
            </div>

            <label className="flex min-h-11 items-center gap-3 text-sm text-ink">
              <input type="checkbox" className="h-5 w-5 shrink-0" checked={draft.copyToSender} disabled={sending} onChange={(e) => set("copyToSender", e.target.checked)} />
              Send a hidden copy to the sender
            </label>
          </div>

          {/* What will be sent */}
          <section aria-label="Preview" className="flex min-h-[32rem] flex-col bg-canvas md:min-h-0">
            <div className="flex flex-wrap items-center gap-2 border-b border-line px-5 py-3 sm:px-6">
              <p className="text-sm font-semibold text-ink">
                {previewPerson ? `Preview for ${previewPerson.full_name}` : "Preview"}
              </p>
              <p className="ml-auto min-w-0 truncate text-sm text-ink-3" aria-live="polite">
                {loading ? "Updating the preview…" : preview && valid ? preview.subject : ""}
              </p>
            </div>
            <div className={cx("relative min-h-0 flex-1 overflow-y-auto p-4 transition-opacity duration-150 sm:p-6", loading && "opacity-60")}>
              {!previewPerson ? (
                <p className="text-sm text-ink-3">Tick someone to see their email.</p>
              ) : !valid ? (
                <p className="text-sm text-ink-3">Fill in the highlighted fields to see the email.</p>
              ) : previewError ? (
                <Alert tone="error">{previewError}</Alert>
              ) : !preview ? (
                <div aria-hidden="true" className="mx-auto h-full min-h-[36rem] w-full max-w-2xl animate-pulse rounded-sm bg-subtle" />
              ) : (
                // Links in the preview open in a new tab, not inside the preview.
                <iframe
                  title="Email preview"
                  srcDoc={preview.html.replace("<head>", '<head><base target="_blank" />')}
                  sandbox="allow-popups allow-popups-to-escape-sandbox"
                  className="mx-auto block h-full min-h-[36rem] w-full max-w-2xl rounded-sm border border-line bg-white" />
              )}
            </div>
          </section>
        </div>

        <div className="space-y-3 border-t border-line bg-canvas px-5 py-4 sm:px-6">
          {sendError && <Alert tone="error">{sendError}</Alert>}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <p className="text-sm text-ink-3 sm:mr-auto">
              {single ? (
                <>
                  Goes to <strong className="text-ink">{single.email}</strong> in {LANGUAGE_NAME[language]}
                </>
              ) : (
                <>
                  Goes to <strong className="text-ink">{recipients.length}</strong> {recipients.length === 1 ? "person" : "people"}, one email each
                </>
              )}
              {draft.copyToSender && draft.replyTo ? `, with a hidden copy to ${draft.replyTo}` : ""}.
            </p>
            <div className="grid grid-cols-2 gap-3 sm:flex">
              <Button variant="outline" disabled={sending} onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" loading={sending} disabled={!recipients.length}>
                {sending ? "Sending…" : single ? "Send reminder" : `Send ${recipients.length} ${recipients.length === 1 ? "reminder" : "reminders"}`}
              </Button>
            </div>
          </div>
        </div>
      </form>
    </dialog>
  );
}
