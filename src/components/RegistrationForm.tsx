"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Button, Card, Kicker } from "@/components/ui";
import { COPY } from "@/lib/registration-copy";
import {
  JOB_FUNCTIONS,
  PASSPORT_MAX_BYTES,
  PASSPORT_MIME_TYPES,
  PROFESSIONAL_CATEGORIES,
  validateRegistration,
  type FieldError,
  type FieldName,
  type Language,
  type ValidationErrors,
} from "@/lib/registration-fields";
import { COUNTRY_CODES, EUROPEAN_VAT_COUNTRIES } from "@/lib/countries";
import { formatPrice } from "@/lib/tickets";
import { EVENT_INFO } from "@/lib/event-info";

export interface TicketOption {
  id: string;
  name: { en: string; fr: string };
  description: { en: string; fr: string };
  amountCents: number;
  currency: string;
}

interface Props {
  tickets: TicketOption[];
  turnstileSiteKey?: string;
  privacyPolicyUrl: string;
  registrationOpen: boolean;
  paymentCancelled: boolean;
}

interface FormState {
  firstName: string;
  lastName: string;
  email: string;
  jobTitle: string;
  phone: string;
  nationality: string;
  residenceCountry: string;
  organization: string;
  organizationCountry: string;
  professionalCategory: string;
  jobFunction: string;
  invitationLetter: string;
  foodAllergies: string;
  ticket: string;
  vatNumber: string;
  invoiceId: string;
  safetyConsent: boolean;
  optInOrganizer: boolean;
  optInSponsors: boolean;
  website: string; // honeypot — must stay empty
}

const EMPTY: FormState = {
  firstName: "",
  lastName: "",
  email: "",
  jobTitle: "",
  phone: "",
  nationality: "",
  residenceCountry: "",
  organization: "",
  organizationCountry: "",
  professionalCategory: "",
  jobFunction: "",
  invitationLetter: "",
  foodAllergies: "",
  ticket: "",
  vatNumber: "",
  invoiceId: "",
  safetyConsent: false,
  optInOrganizer: false,
  optInSponsors: false,
  website: "",
};

type Phase =
  | { kind: "editing" }
  | { kind: "submitting" }
  | { kind: "uploading"; pct: number }
  | { kind: "redirecting" }
  | { kind: "already_registered" };

const LANG_KEY = "nsac_lang";
// Answers are kept for this browser tab, so a refresh or a cancelled
// payment doesn't mean starting again. (The passport file isn't kept.)
const DRAFT_KEY = "nsac_reg_draft";

// The three steps, and the fields each one asks for — used to check a step
// before moving on, and to jump back to the step that has an error.
const STEP_FIELDS: FieldName[][] = [
  ["firstName", "lastName", "email", "jobTitle", "phone", "nationality", "residenceCountry"],
  ["organization", "organizationCountry", "professionalCategory", "jobFunction", "invitationLetter", "passport", "foodAllergies"],
  ["ticket", "vatNumber", "invoiceId", "safetyConsent"],
];
const LAST_STEP = STEP_FIELDS.length - 1;

function stepOfField(field: string): number {
  const i = STEP_FIELDS.findIndex((fields) => fields.includes(field as FieldName));
  return i === -1 ? LAST_STEP : i;
}

function errorsForStep(all: ValidationErrors, step: number): ValidationErrors {
  const out: ValidationErrors = {};
  for (const f of STEP_FIELDS[step]) if (all[f]) out[f] = all[f];
  return out;
}

// Reads a browser setting without ever throwing (private mode, blocked storage…).
function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function safeSet(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

// Large phone photos are shrunk before upload (still sharp enough to read a
// passport) so the upload works on slow mobile connections. PDFs go as-is.
async function preparePassport(file: File): Promise<Blob> {
  if (!file.type.startsWith("image/") || file.size < 1_500_000) return file;
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, 2400 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.85)
    );
    return blob && blob.size < file.size ? blob : file;
  } catch {
    return file;
  }
}

// Supabase signed upload: PUT multipart to the signed URL. XHR (not fetch)
// so we can show progress on slow connections.
function uploadWithProgress(url: string, blob: Blob, onProgress: (pct: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const body = new FormData();
    body.append("cacheControl", "3600");
    body.append("", blob);
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`upload ${xhr.status}`)));
    xhr.onerror = () => reject(new Error("upload network error"));
    xhr.timeout = 120_000;
    xhr.ontimeout = () => reject(new Error("upload timeout"));
    xhr.send(body);
  });
}

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: Record<string, unknown>) => string;
      reset: (id?: string) => void;
      remove: (id?: string) => void;
    };
  }
}

export default function RegistrationForm({
  tickets,
  turnstileSiteKey,
  privacyPolicyUrl,
  registrationOpen,
  paymentCancelled,
}: Props) {
  const [lang, setLang] = useState<Language>("en");
  const t = COPY[lang];
  const [form, setForm] = useState<FormState>(() => ({
    ...EMPTY,
    ticket: tickets.length === 1 ? tickets[0].id : "",
  }));
  const [passportFile, setPassportFile] = useState<File | null>(null);
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [banner, setBanner] = useState<string>("");
  const [notice, setNotice] = useState<string>("");
  const [phase, setPhase] = useState<Phase>({ kind: "editing" });
  const [step, setStep] = useState(0);
  // Set once the visitor changes something, so the empty form on first
  // load never overwrites a saved draft before it's restored.
  const dirty = useRef(false);
  const [countryOptions, setCountryOptions] = useState<{ code: string; name: string }[]>([]);
  const submissionId = useRef<string>("");
  const turnstileToken = useRef<string>("");
  const turnstileWidget = useRef<string | undefined>(undefined);
  const turnstileEl = useRef<HTMLDivElement>(null);
  const formTop = useRef<HTMLDivElement>(null);

  // Language: saved choice, else the phone's language (French → fr).
  useEffect(() => {
    const saved = safeGet(LANG_KEY);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reading browser-only settings after hydration
    if (saved === "en" || saved === "fr") setLang(saved);
    else if (navigator.language?.toLowerCase().startsWith("fr")) setLang("fr");
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  // Restore answers saved earlier in this tab (refresh, or back from a
  // cancelled payment — then straight to the last step).
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const draft = JSON.parse(raw) as { form?: Partial<FormState>; step?: number };
      // eslint-disable-next-line react-hooks/set-state-in-effect -- restoring a draft saved in this browser tab
      if (draft.form) setForm((f) => ({ ...f, ...draft.form, website: "" }));
      if (paymentCancelled) setStep(LAST_STEP);
      else if (typeof draft.step === "number") setStep(Math.min(Math.max(0, draft.step), LAST_STEP));
    } catch {
      /* no saved draft */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only on first load
  }, []);

  useEffect(() => {
    if (!dirty.current) return;
    try {
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ form: { ...form, website: "" }, step }));
    } catch {
      /* storage unavailable (private mode) — nothing to do */
    }
  }, [form, step]);

  // Country names in the visitor's language. Built after hydration because
  // the server's and the browser's country-name data can differ slightly.
  useEffect(() => {
    const names = new Intl.DisplayNames([lang], { type: "region" });
    const list = COUNTRY_CODES.map((code) => ({ code, name: names.of(code) ?? code }));
    list.sort((a, b) => a.name.localeCompare(b.name, lang));
    // eslint-disable-next-line react-hooks/set-state-in-effect -- derived from a browser API
    setCountryOptions(list);
  }, [lang]);

  // Cloudflare Turnstile spam check (only if a site key is configured).
  useEffect(() => {
    if (!turnstileSiteKey || step !== LAST_STEP || !turnstileEl.current) return;
    const el = turnstileEl.current;
    const render = () => {
      if (!window.turnstile || turnstileWidget.current !== undefined) return;
      turnstileWidget.current = window.turnstile.render(el, {
        sitekey: turnstileSiteKey,
        callback: (token: string) => (turnstileToken.current = token),
        "expired-callback": () => (turnstileToken.current = ""),
        "error-callback": () => (turnstileToken.current = ""),
      });
    };
    // The widget lives on the last step; forget it when leaving that step.
    const cleanup = () => {
      if (turnstileWidget.current !== undefined) window.turnstile?.remove(turnstileWidget.current);
      turnstileWidget.current = undefined;
      turnstileToken.current = "";
    };
    if (window.turnstile) {
      render();
      return cleanup;
    }
    const script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async = true;
    script.onload = render;
    document.head.appendChild(script);
    return cleanup;
  }, [turnstileSiteKey, step]);

  function chooseLang(next: Language) {
    setLang(next);
    safeSet(LANG_KEY, next);
  }

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    dirty.current = true;
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => (key in e ? { ...e, [key]: undefined } : e));
  }

  const selectedTicket = tickets.find((tk) => tk.id === form.ticket);
  const vatRequired = EUROPEAN_VAT_COUNTRIES.has(form.organizationCountry);
  const busy = phase.kind !== "editing" && phase.kind !== "already_registered";

  const payload = useMemo(
    () => ({
      ...form,
      language: lang,
      passport: passportFile ? { mime: passportFile.type, size: passportFile.size } : null,
    }),
    [form, lang, passportFile]
  );

  function scrollToFirstError(errs: ValidationErrors) {
    // After a step change the field isn't on screen until the next render.
    setTimeout(() => {
      const first = Object.keys(errs)[0];
      const el = first ? document.getElementById(`field-${first}`) : null;
      (el ?? formTop.current)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 60);
  }

  function goToStep(next: number) {
    dirty.current = true;
    setStep(next);
    setBanner("");
    formTop.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  /** Shows the errors, on the earliest step that has one. */
  function showErrors(errs: ValidationErrors) {
    const firstStep = Math.min(...Object.keys(errs).map(stepOfField));
    setStep(firstStep);
    setErrors(errs);
    setBanner(t.errors.summary);
    scrollToFirstError(errs);
  }

  function handleNext() {
    if (!submissionId.current) submissionId.current = crypto.randomUUID();
    const check = validateRegistration({ ...payload, id: submissionId.current }, tickets.map((tk) => tk.id));
    const stepErrs = check.ok ? {} : errorsForStep(check.errors, step);
    if (Object.keys(stepErrs).length > 0) {
      setErrors(stepErrs);
      setBanner(t.errors.summary);
      scrollToFirstError(stepErrs);
      return;
    }
    setErrors({});
    goToStep(step + 1);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    // Enter / "Continue" on the first steps moves to the next step.
    if (step < LAST_STEP) {
      handleNext();
      return;
    }
    setBanner("");
    setNotice("");

    // Same id for every retry of this submission, so a lost response can
    // never create two registrations.
    if (!submissionId.current) submissionId.current = crypto.randomUUID();

    const local = validateRegistration(
      { ...payload, id: submissionId.current },
      tickets.map((tk) => tk.id)
    );
    if (!local.ok) {
      showErrors(local.errors);
      return;
    }

    setPhase({ kind: "submitting" });
    let res: Response;
    let json: Record<string, unknown>;
    try {
      res = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...payload,
          id: submissionId.current,
          turnstileToken: turnstileToken.current,
        }),
        signal: AbortSignal.timeout(45_000),
      });
      json = await res.json();
    } catch {
      setPhase({ kind: "editing" });
      setBanner(t.errors.network);
      return;
    } finally {
      // A Turnstile token can only be used once.
      if (turnstileSiteKey && window.turnstile) {
        turnstileToken.current = "";
        window.turnstile.reset(turnstileWidget.current);
      }
    }

    if (!res.ok) {
      setPhase({ kind: "editing" });
      if (json.error === "validation" && json.fields) {
        showErrors(json.fields as ValidationErrors);
      } else if (json.error === "spam_check_failed") setBanner(t.errors.spam);
      else if (json.error === "registration_closed") setBanner(t.errors.closed);
      else if (json.error === "payment_unavailable") setBanner(t.errors.payment);
      else setBanner(t.errors.server);
      formTop.current?.scrollIntoView({ behavior: "smooth" });
      return;
    }

    if (json.status === "already_registered") {
      setPhase({ kind: "already_registered" });
      formTop.current?.scrollIntoView({ behavior: "smooth" });
      return;
    }

    if (json.status === "payment_required" && typeof json.checkoutUrl === "string") {
      if (json.passportSkipped) setNotice(t.passportSkipped);
      if (typeof json.passportUploadUrl === "string" && passportFile) {
        setPhase({ kind: "uploading", pct: 0 });
        try {
          const blob = await preparePassport(passportFile);
          await uploadWithProgress(json.passportUploadUrl, blob, (pct) =>
            setPhase({ kind: "uploading", pct })
          );
        } catch {
          // Don't block payment on the passport: staff can collect it by email.
          setNotice(t.errors.passportUpload);
          await new Promise((r) => setTimeout(r, 2500));
        }
      }
      setPhase({ kind: "redirecting" });
      window.location.assign(json.checkoutUrl);
      return;
    }

    setPhase({ kind: "editing" });
    setBanner(t.errors.server);
  }

  function onPassportChange(file: File | null) {
    setErrors((e) => ({ ...e, passport: undefined }));
    if (!file) {
      setPassportFile(null);
      return;
    }
    if (!(PASSPORT_MIME_TYPES as readonly string[]).includes(file.type)) {
      setErrors((e) => ({ ...e, passport: "file_type" }));
      setPassportFile(null);
      return;
    }
    if (file.size > PASSPORT_MAX_BYTES) {
      setErrors((e) => ({ ...e, passport: "file_too_large" }));
      setPassportFile(null);
      return;
    }
    setPassportFile(file);
  }

  const err = (name: FieldName): string | undefined => {
    const code = errors[name] as FieldError | undefined;
    return code ? t.errors[code] : undefined;
  };

  const privacyToken = "{privacy}";
  const [consentBefore, consentAfter] = t.fields.safetyConsent(privacyToken).split(privacyToken);
  const privacyLabel = lang === "fr" ? "politique de confidentialité" : "privacy policy";

  return (
    <main className="flex-1 brand-glow px-4 py-8 sm:py-12">
      <div ref={formTop} className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <Kicker>{t.kicker}</Kicker>
            <h1 className="font-display text-3xl sm:text-4xl text-navy">{t.title}</h1>
            <p className="flex items-center gap-2 text-sm font-semibold text-navy/70">
              <span className="h-1.5 w-1.5 rounded-full bg-gold" aria-hidden="true" />
              {EVENT_INFO.date[lang]} · {EVENT_INFO.place[lang]}
            </p>
          </div>
          <LanguageSwitch lang={lang} onChange={chooseLang} />
        </div>
        <p className="text-navy/65 text-[15px] leading-relaxed">
          {t.intro}{" "}
          <a className="text-navy font-semibold underline decoration-gold underline-offset-2" href={`mailto:${t.helpEmail}`}>
            {t.helpEmail}
          </a>
          .
        </p>

        {!registrationOpen ? (
          <Card className="p-6 text-navy">{t.errors.closed}</Card>
        ) : phase.kind === "already_registered" ? (
          <Card className="p-6 sm:p-8 space-y-3" role="status">
            <h2 className="font-display text-2xl text-navy">{t.alreadyRegistered.title}</h2>
            <p className="text-navy/70">{t.alreadyRegistered.body}</p>
          </Card>
        ) : (
          <form onSubmit={handleSubmit} noValidate className="space-y-6">
            {paymentCancelled && !banner && <Alert tone="info">{t.cancelled}</Alert>}
            {banner && <Alert tone="error">{banner}</Alert>}
            {notice && <Alert tone="info">{notice}</Alert>}

            <StepProgress labels={t.steps} current={step} stepOf={t.stepOf} onJump={goToStep} />

            {step === 0 && (
              <>
                <Section title={t.sections.you}>
                  <div className="grid sm:grid-cols-2 gap-4">
                    <TextField name="firstName" label={t.fields.firstName} value={form.firstName} onChange={(v) => update("firstName", v)} error={err("firstName")} autoComplete="given-name" />
                    <TextField name="lastName" label={t.fields.lastName} value={form.lastName} onChange={(v) => update("lastName", v)} error={err("lastName")} autoComplete="family-name" />
                  </div>
                  <TextField name="email" type="email" label={t.fields.email} hint={t.fields.emailHint} value={form.email} onChange={(v) => update("email", v)} error={err("email")} autoComplete="email" inputMode="email" />
                  <TextField name="jobTitle" label={t.fields.jobTitle} value={form.jobTitle} onChange={(v) => update("jobTitle", v)} error={err("jobTitle")} autoComplete="organization-title" />
                  <TextField name="phone" type="tel" label={t.fields.phone} optionalLabel={t.optional} hint={t.fields.phoneHint} value={form.phone} onChange={(v) => update("phone", v)} error={err("phone")} autoComplete="tel" inputMode="tel" />
                  <div className="grid sm:grid-cols-2 gap-4">
                    <CountryField name="nationality" label={t.fields.nationality} value={form.nationality} onChange={(v) => update("nationality", v)} options={countryOptions} placeholder={t.selectPlaceholder} error={err("nationality")} />
                    <CountryField name="residenceCountry" label={t.fields.residenceCountry} hint={t.fields.residenceHint} value={form.residenceCountry} onChange={(v) => update("residenceCountry", v)} options={countryOptions} placeholder={t.selectPlaceholder} error={err("residenceCountry")} autoComplete="country" />
                  </div>
                </Section>
              </>
            )}

            {step === 1 && (
              <>
                <Section title={t.sections.organization}>
                  <TextField name="organization" label={t.fields.organization} value={form.organization} onChange={(v) => update("organization", v)} error={err("organization")} autoComplete="organization" />
                  <CountryField name="organizationCountry" label={t.fields.organizationCountry} value={form.organizationCountry} onChange={(v) => update("organizationCountry", v)} options={countryOptions} placeholder={t.selectPlaceholder} error={err("organizationCountry")} />
                  <RadioGroup
                    name="professionalCategory"
                    label={t.fields.professionalCategory}
                    value={form.professionalCategory}
                    onChange={(v) => update("professionalCategory", v)}
                    options={PROFESSIONAL_CATEGORIES.map((c) => ({ value: c, label: t.professionalCategories[c] }))}
                    error={err("professionalCategory")}
                    columns
                  />
                  <RadioGroup
                    name="jobFunction"
                    label={t.fields.jobFunction}
                    value={form.jobFunction}
                    onChange={(v) => update("jobFunction", v)}
                    options={JOB_FUNCTIONS.map((c) => ({ value: c, label: t.jobFunctions[c] }))}
                    error={err("jobFunction")}
                  />
                </Section>

                <Section title={t.sections.travel}>
                  <RadioGroup
                    name="invitationLetter"
                    label={t.fields.invitationLetter}
                    value={form.invitationLetter}
                    onChange={(v) => update("invitationLetter", v)}
                    options={[
                      { value: "yes", label: t.yes },
                      { value: "no", label: t.no },
                    ]}
                    error={err("invitationLetter")}
                    inline
                  />
                  {form.invitationLetter === "yes" && (
                    <FieldShell name="passport" label={t.fields.passport} optionalLabel={t.optional} hint={t.fields.passportHint} error={err("passport")}>
                      <div className="flex flex-wrap items-center gap-3">
                        <label className="inline-flex cursor-pointer items-center rounded-full border border-navy/20 px-4 py-2 text-sm font-semibold text-navy hover:bg-navy/5 focus-within:ring-2 focus-within:ring-gold/40">
                          {t.fields.passportChoose}
                          <input
                            id="field-passport"
                            type="file"
                            accept={PASSPORT_MIME_TYPES.join(",")}
                            className="sr-only"
                            onChange={(e) => onPassportChange(e.target.files?.[0] ?? null)}
                            aria-describedby="hint-passport"
                          />
                        </label>
                        {passportFile && (
                          <span className="flex items-center gap-2 text-sm text-navy/70 min-w-0">
                            <span className="truncate max-w-[14rem]">{passportFile.name}</span>
                            <span className="text-navy/40">({(passportFile.size / 1_048_576).toFixed(1)} MB)</span>
                            <button type="button" className="text-navy/60 underline" onClick={() => onPassportChange(null)}>
                              {t.fields.passportRemove}
                            </button>
                          </span>
                        )}
                      </div>
                    </FieldShell>
                  )}
                  <FieldShell name="foodAllergies" label={t.fields.foodAllergies} hint={t.fields.foodAllergiesHint} error={err("foodAllergies")}>
                    <textarea
                      id="field-foodAllergies"
                      rows={2}
                      maxLength={500}
                      className={inputClass(!!err("foodAllergies"))}
                      value={form.foodAllergies}
                      onChange={(e) => update("foodAllergies", e.target.value)}
                      aria-invalid={!!err("foodAllergies")}
                      aria-describedby="hint-foodAllergies error-foodAllergies"
                    />
                  </FieldShell>
                </Section>
              </>
            )}

            {step === LAST_STEP && (
              <>
                <Section title={t.sections.ticket}>
                  <fieldset id="field-ticket" className="space-y-3" aria-describedby="error-ticket">
                    <legend className="text-sm font-semibold text-navy mb-2">{t.fields.ticket}</legend>
                    {tickets.map((tk) => {
                      const checked = form.ticket === tk.id;
                      return (
                        <label
                          key={tk.id}
                          className={`flex cursor-pointer items-start justify-between gap-4 rounded-xl border p-4 transition-colors ${
                            checked ? "border-gold bg-gold/[0.07] ring-1 ring-gold" : "border-navy/15 hover:border-navy/30"
                          }`}
                        >
                          <span className="flex items-start gap-3">
                            <input
                              type="radio"
                              name="ticket"
                              value={tk.id}
                              checked={checked}
                              onChange={() => update("ticket", tk.id)}
                              className="mt-1 h-4 w-4 accent-[var(--gold)]"
                            />
                            <span>
                              <span className="block font-semibold text-navy">{tk.name[lang]}</span>
                              <span className="block text-sm text-navy/60">{tk.description[lang]}</span>
                            </span>
                          </span>
                          <span className="font-display text-lg text-navy whitespace-nowrap">
                            {formatPrice(tk.amountCents, tk.currency, lang)}
                          </span>
                        </label>
                      );
                    })}
                    {err("ticket") && <ErrorText id="error-ticket">{err("ticket")}</ErrorText>}
                    <p className="text-xs text-navy/50">{t.fields.couponHint}</p>
                  </fieldset>
                  <div className="grid sm:grid-cols-2 gap-4">
                    <TextField
                      name="vatNumber"
                      label={t.fields.vatNumber}
                      optionalLabel={vatRequired ? undefined : t.optional}
                      hint={vatRequired ? t.fields.vatRequiredHint : t.fields.vatHint}
                      value={form.vatNumber}
                      onChange={(v) => update("vatNumber", v)}
                      error={err("vatNumber")}
                    />
                    <TextField name="invoiceId" label={t.fields.invoiceId} optionalLabel={t.optional} value={form.invoiceId} onChange={(v) => update("invoiceId", v)} error={err("invoiceId")} />
                  </div>
                </Section>

                <Section title={t.sections.agreements}>
                  <div id="field-safetyConsent" className="space-y-1.5">
                    <Checkbox checked={form.safetyConsent} onChange={(v) => update("safetyConsent", v)} invalid={!!err("safetyConsent")} describedBy="error-safetyConsent">
                      {consentBefore}
                      <a href={privacyPolicyUrl} target="_blank" rel="noopener noreferrer" className="underline decoration-gold underline-offset-2 text-navy">
                        {privacyLabel}
                      </a>
                      {consentAfter}
                    </Checkbox>
                    {err("safetyConsent") && <ErrorText id="error-safetyConsent">{err("safetyConsent")}</ErrorText>}
                  </div>
                  <Checkbox checked={form.optInOrganizer} onChange={(v) => update("optInOrganizer", v)}>
                    {t.fields.optInOrganizer}
                  </Checkbox>
                  <Checkbox checked={form.optInSponsors} onChange={(v) => update("optInSponsors", v)}>
                    {t.fields.optInSponsors}
                  </Checkbox>
                </Section>

                <Review
                  t={t}
                  lang={lang}
                  form={form}
                  ticket={selectedTicket}
                  onEdit={goToStep}
                />
              </>
            )}

            {/* Honeypot: hidden from people and screen readers; bots fill it in. */}
            <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
              <label>
                Website
                <input tabIndex={-1} autoComplete="off" value={form.website} onChange={(e) => update("website", e.target.value)} />
              </label>
            </div>

            {step === LAST_STEP && turnstileSiteKey && <div ref={turnstileEl} className="min-h-[65px]" />}

            {step < LAST_STEP ? (
              <div className="flex items-center gap-3">
                {step > 0 && (
                  <Button type="button" variant="outline" onClick={() => goToStep(step - 1)}>
                    ← {t.back}
                  </Button>
                )}
                <Button type="submit" variant="gold" className="ml-auto !px-8 !py-3 !text-base">
                  {t.next} →
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                <Button type="submit" variant="gold" className="w-full !py-3.5 !text-base" disabled={busy}>
                  {phase.kind === "submitting"
                    ? t.submitting
                    : phase.kind === "uploading"
                      ? t.uploading(phase.pct)
                      : phase.kind === "redirecting"
                        ? t.redirecting
                        : t.submit(selectedTicket ? formatPrice(selectedTicket.amountCents, selectedTicket.currency, lang) : "")
                          .replace(/ · $/, "")}
                </Button>
                <button
                  type="button"
                  onClick={() => goToStep(step - 1)}
                  disabled={busy}
                  className="block w-full text-center text-sm font-semibold text-navy/60 hover:text-navy disabled:opacity-50"
                >
                  ← {t.back}
                </button>
                <p className="text-center text-xs text-navy/50">{t.securePayment}</p>
              </div>
            )}
          </form>
        )}
      </div>
    </main>
  );
}

// ---------- step progress + review ----------

function StepProgress({
  labels,
  current,
  stepOf,
  onJump,
}: {
  labels: readonly string[];
  current: number;
  stepOf: (n: number, total: number) => string;
  onJump: (step: number) => void;
}) {
  return (
    <nav aria-label={stepOf(current + 1, labels.length)} className="space-y-3">
      <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider">
        <span className="text-gold">{stepOf(current + 1, labels.length)}</span>
        <span className="text-navy/50 normal-case tracking-normal text-sm">{labels[current]}</span>
      </div>
      <ol className="grid gap-2" style={{ gridTemplateColumns: `repeat(${labels.length}, minmax(0, 1fr))` }}>
        {labels.map((label, i) => {
          const done = i < current;
          const active = i === current;
          return (
            <li key={label}>
              <button
                type="button"
                onClick={() => done && onJump(i)}
                disabled={!done}
                aria-current={active ? "step" : undefined}
                className="group w-full text-left disabled:cursor-default"
              >
                <span
                  className={`block h-1.5 rounded-full transition-colors ${
                    done ? "bg-gold group-hover:bg-gold-light" : active ? "bg-navy" : "bg-navy/12"
                  }`}
                />
                <span
                  className={`mt-2 hidden sm:flex items-center gap-1.5 text-xs font-semibold ${
                    active ? "text-navy" : done ? "text-navy/60 group-hover:text-navy" : "text-navy/35"
                  }`}
                >
                  <span
                    className={`inline-flex h-4.5 w-4.5 items-center justify-center rounded-full text-[10px] ${
                      done ? "bg-gold text-navy" : active ? "bg-navy text-white" : "bg-navy/10 text-navy/50"
                    }`}
                  >
                    {done ? "✓" : i + 1}
                  </span>
                  {label}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function Review({
  t,
  lang,
  form,
  ticket,
  onEdit,
}: {
  t: (typeof COPY)[Language];
  lang: Language;
  form: FormState;
  ticket: TicketOption | undefined;
  onEdit: (step: number) => void;
}) {
  const rows: { label: string; value: string; step: number }[] = [
    { label: t.review.name, value: `${form.firstName} ${form.lastName}`.trim(), step: 0 },
    { label: t.review.email, value: form.email, step: 0 },
    { label: t.review.organization, value: [form.jobTitle, form.organization].filter(Boolean).join(" · "), step: 1 },
  ];
  return (
    <Card className="p-5 sm:p-7 space-y-4">
      <h2 className="font-display text-lg text-navy flex items-center gap-2.5">
        <span className="h-4 w-1 rounded-full bg-gold" aria-hidden="true" />
        {t.review.title}
      </h2>
      <dl className="divide-y divide-navy/8 text-[15px]">
        {rows.map((r) => (
          <div key={r.label} className="flex items-start justify-between gap-4 py-2.5">
            <dt className="text-navy/55 shrink-0">{r.label}</dt>
            <dd className="flex items-start gap-3 text-right text-navy font-medium min-w-0">
              <span className="break-words">{r.value || "—"}</span>
              <button type="button" onClick={() => onEdit(r.step)} className="text-xs font-semibold text-navy/50 underline decoration-gold hover:text-navy shrink-0">
                {t.review.edit}
              </button>
            </dd>
          </div>
        ))}
      </dl>
      <div className="flex items-end justify-between gap-4 rounded-xl bg-navy text-white px-5 py-4">
        <div>
          <div className="text-xs uppercase tracking-wider text-white/55">{t.review.total}</div>
          <div className="text-sm text-white/80">{ticket ? ticket.name[lang] : t.review.noTicket}</div>
        </div>
        <div className="font-display text-2xl">{ticket ? formatPrice(ticket.amountCents, ticket.currency, lang) : "—"}</div>
      </div>
    </Card>
  );
}

// ---------- small presentational helpers ----------

function inputClass(invalid: boolean) {
  return `w-full rounded-lg border bg-white px-4 py-2.5 text-[16px] text-navy placeholder:text-navy/35 outline-none focus:ring-2 ${
    invalid ? "border-red-500 focus:ring-red-200" : "border-navy/15 focus:border-gold focus:ring-gold/25"
  }`;
}

function LanguageSwitch({ lang, onChange }: { lang: Language; onChange: (l: Language) => void }) {
  return (
    <div className="inline-flex shrink-0 rounded-full border border-navy/15 bg-white p-0.5 text-xs font-semibold" role="group" aria-label="Language / Langue">
      {(["en", "fr"] as const).map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => onChange(l)}
          aria-pressed={lang === l}
          className={`rounded-full px-3 py-1.5 uppercase tracking-wider ${lang === l ? "bg-navy text-white" : "text-navy/60 hover:text-navy"}`}
        >
          {l}
        </button>
      ))}
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card className="p-5 sm:p-7 space-y-5">
      <h2 className="font-display text-lg text-navy flex items-center gap-2.5">
        <span className="h-4 w-1 rounded-full bg-gold" aria-hidden="true" />
        {title}
      </h2>
      {children}
    </Card>
  );
}

function Alert({ tone, children }: { tone: "error" | "info"; children: ReactNode }) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={`rounded-xl border px-4 py-3 text-sm ${
        tone === "error" ? "border-red-300 bg-red-50 text-red-800" : "border-gold/40 bg-gold/10 text-navy"
      }`}
    >
      {children}
    </div>
  );
}

function ErrorText({ id, children }: { id: string; children: ReactNode }) {
  return (
    <p id={id} className="text-sm text-red-600">
      {children}
    </p>
  );
}

function FieldShell({
  name,
  label,
  optionalLabel,
  hint,
  error,
  children,
}: {
  name: string;
  label: string;
  optionalLabel?: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={`field-${name}`} className="block text-sm font-semibold text-navy">
        {label}
        {optionalLabel ? (
          <span className="ml-1.5 font-normal text-navy/45">({optionalLabel})</span>
        ) : (
          <span className="ml-0.5 text-gold" aria-hidden="true">*</span>
        )}
      </label>
      {children}
      {hint && (
        <p id={`hint-${name}`} className="text-xs text-navy/50">
          {hint}
        </p>
      )}
      {error && <ErrorText id={`error-${name}`}>{error}</ErrorText>}
    </div>
  );
}

function TextField({
  name,
  label,
  value,
  onChange,
  error,
  hint,
  optionalLabel,
  type = "text",
  autoComplete,
  inputMode,
}: {
  name: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  hint?: string;
  optionalLabel?: string;
  type?: string;
  autoComplete?: string;
  inputMode?: "email" | "tel" | "text";
}) {
  return (
    <FieldShell name={name} label={label} optionalLabel={optionalLabel} hint={hint} error={error}>
      <input
        id={`field-${name}`}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        inputMode={inputMode}
        className={inputClass(!!error)}
        aria-invalid={!!error}
        aria-describedby={`${hint ? `hint-${name} ` : ""}${error ? `error-${name}` : ""}`.trim() || undefined}
        required={!optionalLabel}
      />
    </FieldShell>
  );
}

function CountryField({
  name,
  label,
  value,
  onChange,
  options,
  placeholder,
  error,
  hint,
  autoComplete,
}: {
  name: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { code: string; name: string }[];
  placeholder: string;
  error?: string;
  hint?: string;
  autoComplete?: string;
}) {
  return (
    <FieldShell name={name} label={label} hint={hint} error={error}>
      <select
        id={`field-${name}`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={inputClass(!!error)}
        aria-invalid={!!error}
        autoComplete={autoComplete}
        required
      >
        <option value="">{placeholder}</option>
        {options.map((o) => (
          <option key={o.code} value={o.code}>
            {o.name}
          </option>
        ))}
      </select>
    </FieldShell>
  );
}

function RadioGroup({
  name,
  label,
  value,
  onChange,
  options,
  error,
  inline,
  columns,
}: {
  name: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  error?: string;
  inline?: boolean;
  columns?: boolean;
}) {
  return (
    <fieldset id={`field-${name}`} className="space-y-2" aria-describedby={error ? `error-${name}` : undefined}>
      <legend className="text-sm font-semibold text-navy mb-1">
        {label}
        <span className="ml-0.5 text-gold" aria-hidden="true">*</span>
      </legend>
      <div className={inline ? "flex flex-wrap gap-2" : columns ? "grid sm:grid-cols-2 gap-2" : "grid gap-2"}>
        {options.map((o) => {
          const checked = value === o.value;
          return (
            <label
              key={o.value}
              className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3.5 py-2.5 text-[15px] transition-colors ${
                checked ? "border-gold bg-gold/[0.07] text-navy" : "border-navy/15 text-navy/80 hover:border-navy/30"
              } ${inline ? "min-w-[6rem]" : ""}`}
            >
              <input
                type="radio"
                name={name}
                value={o.value}
                checked={checked}
                onChange={() => onChange(o.value)}
                className="h-4 w-4 shrink-0 accent-[var(--gold)]"
              />
              {o.label}
            </label>
          );
        })}
      </div>
      {error && <ErrorText id={`error-${name}`}>{error}</ErrorText>}
    </fieldset>
  );
}

function Checkbox({
  checked,
  onChange,
  children,
  invalid,
  describedBy,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  children: ReactNode;
  invalid?: boolean;
  describedBy?: string;
}) {
  return (
    <label className={`flex cursor-pointer items-start gap-3 text-[15px] leading-snug ${invalid ? "text-red-700" : "text-navy/80"}`}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--gold)]"
        aria-invalid={invalid || undefined}
        aria-describedby={invalid ? describedBy : undefined}
      />
      <span>{children}</span>
    </label>
  );
}
