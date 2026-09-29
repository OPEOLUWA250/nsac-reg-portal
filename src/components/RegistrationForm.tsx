"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Alert,
  Button,
  buttonClass,
  Card,
  cx,
  describedBy,
  Eyebrow,
  Field,
  FieldError,
  inputClass,
  LanguageSwitch,
  linkClass,
} from "@/components/ui";
import { IconCheck } from "@/components/icons";
import CountryCombobox from "@/components/CountryCombobox";
import { preferredLanguage, setSiteLanguage } from "@/lib/site-language";
import { COPY } from "@/lib/registration-copy";
import {
  JOB_FUNCTIONS,
  PASSPORT_MAX_BYTES,
  PASSPORT_MIME_TYPES,
  PROFESSIONAL_CATEGORIES,
  REGISTRATION_DRAFT_KEY,
  validateRegistration,
  type FieldError as FieldErrorCode,
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
  /** From ?lang=fr on the link, e.g. the home page's French link. */
  initialLang?: Language;
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

// Answers are kept for this browser tab, so a refresh or a cancelled
// payment doesn't mean starting again. (The passport file isn't kept.)
const DRAFT_KEY = REGISTRATION_DRAFT_KEY;

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

function clearDraft() {
  try {
    sessionStorage.removeItem(DRAFT_KEY);
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
  initialLang,
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

  // Language: the link's ?lang=, else the saved choice, else the phone's
  // language (French → fr).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reading browser-only settings after hydration
    setLang(initialLang ?? preferredLanguage());
  }, [initialLang]);

  // The header and footer follow the form's language.
  useEffect(() => {
    setSiteLanguage(lang, { remember: lang === initialLang });
  }, [lang, initialLang]);

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

  // Browsers keep a frozen copy of this page when we send the visitor to
  // Stripe. Coming back (Back button) restores it mid-"redirecting", with
  // the button disabled — so reset it to a usable state.
  useEffect(() => {
    const onPageShow = (e: PageTransitionEvent) => {
      if (!e.persisted) return;
      setNotice("");
      setBanner("");
      let draftExists = false;
      try {
        draftExists = sessionStorage.getItem(DRAFT_KEY) !== null;
      } catch {
        /* storage unavailable */
      }
      if (draftExists) {
        // Came back from Stripe without paying: keep their answers.
        setPhase((p) => (p.kind === "already_registered" ? p : { kind: "editing" }));
        return;
      }
      // The draft is gone: payment succeeded (the success page clears it).
      // Start a fresh registration on step 1.
      dirty.current = false;
      submissionId.current = "";
      setForm({ ...EMPTY, ticket: tickets.length === 1 ? tickets[0].id : "" });
      setPassportFile(null);
      setErrors({});
      setStep(0);
      setPhase({ kind: "editing" });
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, [tickets]);

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
    setSiteLanguage(next, { remember: true });
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
      clearDraft();
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
    const code = errors[name] as FieldErrorCode | undefined;
    return code ? t.errors[code] : undefined;
  };

  const privacyToken = "{privacy}";
  const [consentBefore, consentAfter] = t.fields.safetyConsent(privacyToken).split(privacyToken);
  const privacyLabel = lang === "fr" ? "politique de confidentialité" : "privacy policy";
  // Our own /privacy page opens in the form's language.
  const privacyHref = privacyPolicyUrl.startsWith("/") ? `${privacyPolicyUrl}?lang=${lang}` : privacyPolicyUrl;

  // Format problems (email, phone…) show as soon as the visitor leaves a
  // field. "Required" waits for Continue, so a new form isn't covered in red.
  function checkField(name: FieldName) {
    const value = form[name as keyof FormState];
    if (typeof value !== "string" || !value.trim()) return;
    const check = validateRegistration({ ...payload, id: submissionId.current }, tickets.map((tk) => tk.id));
    const code = check.ok ? undefined : check.errors[name];
    if (code) setErrors((e) => ({ ...e, [name]: code }));
  }

  const submitLabel =
    phase.kind === "submitting"
      ? t.submitting
      : phase.kind === "uploading"
        ? t.uploading(phase.pct)
        : phase.kind === "redirecting"
          ? t.redirecting
          : t.submit(selectedTicket ? formatPrice(selectedTicket.amountCents, selectedTicket.currency, lang) : "").replace(/ · $/, "");

  return (
    <main id="main" className="flex-1 px-4 py-8 sm:px-6 sm:py-12">
      <div ref={formTop} className="mx-auto max-w-2xl scroll-mt-20 space-y-6">
        {/* wrap-reverse: with very large text the language switch moves above the title instead of squeezing it (items-end = top, in reverse) */}
        <div className="flex flex-wrap-reverse items-end justify-between gap-4">
          <div className="min-w-0 flex-1 basis-48 space-y-2">
            <Eyebrow>{t.kicker}</Eyebrow>
            <h1 className="font-display text-3xl font-extrabold wrap-break-word text-blue sm:text-4xl">{t.title}</h1>
            <p className="text-sm font-semibold text-ink-2">
              {EVENT_INFO.date[lang]} · {EVENT_INFO.place[lang]}
            </p>
          </div>
          <LanguageSwitch lang={lang} onChange={chooseLang} />
        </div>

        {!registrationOpen ? (
          <Card className="p-6 sm:p-8 space-y-3">
            <h2 className="font-display text-xl font-bold text-blue">{t.closedTitle}</h2>
            <p className="text-ink-2">
              {t.closedBody}{" "}
              <a className={linkClass} href={`mailto:${t.helpEmail}`}>
                {t.helpEmail}
              </a>
              .
            </p>
          </Card>
        ) : phase.kind === "already_registered" ? (
          <Card className="p-6 sm:p-8 space-y-3" role="status">
            <IconCheck className="h-7 w-7 text-success" />
            <h2 className="font-display text-xl font-bold text-blue">{t.alreadyRegistered.title}</h2>
            <p className="text-ink-2">{t.alreadyRegistered.body}</p>
          </Card>
        ) : (
          <>
            <p className="text-base text-ink-2">
              {t.intro}{" "}
              <a className={linkClass} href={`mailto:${t.helpEmail}`}>
                {t.helpEmail}
              </a>
              .
            </p>

            <form onSubmit={handleSubmit} noValidate className="space-y-6">
              {paymentCancelled && !banner && <Alert tone="info">{t.cancelled}</Alert>}
              {banner && <Alert tone="error">{banner}</Alert>}
              {notice && <Alert tone="info">{notice}</Alert>}

              <StepProgress labels={t.steps} current={step} stepOf={t.stepOf} onJump={goToStep} />

              {/* Keyed by step so each step fades in. */}
              <div key={step} className="space-y-6 transition-opacity duration-150 starting:opacity-0">
                {step === 0 && (
                  <Section title={t.sections.you}>
                    <div className="grid gap-5 sm:grid-cols-2">
                      <TextField name="firstName" label={t.fields.firstName} value={form.firstName} onChange={(v) => update("firstName", v)} error={err("firstName")} autoComplete="given-name" />
                      <TextField name="lastName" label={t.fields.lastName} value={form.lastName} onChange={(v) => update("lastName", v)} error={err("lastName")} autoComplete="family-name" />
                    </div>
                    <TextField name="email" type="email" label={t.fields.email} hint={t.fields.emailHint} value={form.email} onChange={(v) => update("email", v)} onBlur={() => checkField("email")} error={err("email")} autoComplete="email" inputMode="email" />
                    <TextField name="jobTitle" label={t.fields.jobTitle} value={form.jobTitle} onChange={(v) => update("jobTitle", v)} error={err("jobTitle")} autoComplete="organization-title" />
                    <TextField name="phone" type="tel" label={t.fields.phone} optionalLabel={t.optional} hint={t.fields.phoneHint} value={form.phone} onChange={(v) => update("phone", v)} onBlur={() => checkField("phone")} error={err("phone")} autoComplete="tel" inputMode="tel" />
                    <div className="grid gap-5 sm:grid-cols-2">
                      <CountryField name="nationality" label={t.fields.nationality} value={form.nationality} onChange={(v) => update("nationality", v)} options={countryOptions} placeholder={t.selectPlaceholder} noMatch={t.noCountry} error={err("nationality")} />
                      <CountryField name="residenceCountry" label={t.fields.residenceCountry} hint={t.fields.residenceHint} value={form.residenceCountry} onChange={(v) => update("residenceCountry", v)} options={countryOptions} placeholder={t.selectPlaceholder} noMatch={t.noCountry} error={err("residenceCountry")} autoComplete="country" />
                    </div>
                  </Section>
                )}

                {step === 1 && (
                  <>
                    <Section title={t.sections.organization}>
                      <TextField name="organization" label={t.fields.organization} value={form.organization} onChange={(v) => update("organization", v)} error={err("organization")} autoComplete="organization" />
                      <CountryField name="organizationCountry" label={t.fields.organizationCountry} value={form.organizationCountry} onChange={(v) => update("organizationCountry", v)} options={countryOptions} placeholder={t.selectPlaceholder} noMatch={t.noCountry} error={err("organizationCountry")} />
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
                        <Field id="field-passport" as="div" label={t.fields.passport} optionalLabel={t.optional} hint={t.fields.passportHint} error={err("passport")}>
                          <div className="flex flex-wrap items-center gap-3">
                            <label className={buttonClass("outline", "md", "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-blue")}>
                              {t.fields.passportChoose}
                              <input
                                id="field-passport"
                                type="file"
                                accept={PASSPORT_MIME_TYPES.join(",")}
                                className="sr-only"
                                onChange={(e) => onPassportChange(e.target.files?.[0] ?? null)}
                                aria-describedby={describedBy("field-passport", { hint: true, error: err("passport") })}
                              />
                            </label>
                            {passportFile && (
                              <span className="flex min-w-0 items-center gap-2 text-sm text-ink-2">
                                <span className="max-w-56 truncate">{passportFile.name}</span>
                                <span className="text-ink-3">({(passportFile.size / 1_048_576).toFixed(1)} MB)</span>
                                <Button variant="ghost" size="sm" onClick={() => onPassportChange(null)}>
                                  {t.fields.passportRemove}
                                </Button>
                              </span>
                            )}
                          </div>
                        </Field>
                      )}
                      <Field id="field-foodAllergies" label={t.fields.foodAllergies} required hint={t.fields.foodAllergiesHint} error={err("foodAllergies")}>
                        <textarea
                          id="field-foodAllergies"
                          rows={2}
                          maxLength={500}
                          className={inputClass(!!err("foodAllergies"))}
                          value={form.foodAllergies}
                          onChange={(e) => update("foodAllergies", e.target.value)}
                          aria-invalid={!!err("foodAllergies")}
                          aria-describedby={describedBy("field-foodAllergies", { hint: true, error: err("foodAllergies") })}
                        />
                      </Field>
                    </Section>
                  </>
                )}

                {step === LAST_STEP && (
                  <>
                    <Section title={t.sections.ticket}>
                      <fieldset id="field-ticket" className="space-y-3" aria-describedby={err("ticket") ? "field-ticket-error" : undefined}>
                        <legend className="mb-2 text-sm font-semibold text-ink">{t.fields.ticket}</legend>
                        {tickets.map((tk) => {
                          const checked = form.ticket === tk.id;
                          return (
                            <label
                              key={tk.id}
                              className={cx(
                                "flex cursor-pointer items-start justify-between gap-4 rounded-md border bg-surface p-4 transition-colors duration-150 has-[:focus-visible]:border-blue has-[:focus-visible]:ring-1 has-[:focus-visible]:ring-blue",
                                checked ? "border-blue ring-1 ring-blue" : "border-line-strong hover:border-ink-3 hover:bg-canvas"
                              )}
                            >
                              <span className="flex items-start gap-3">
                                <input
                                  type="radio"
                                  name="ticket"
                                  value={tk.id}
                                  checked={checked}
                                  onChange={() => update("ticket", tk.id)}
                                  className="mt-0.5 h-5 w-5 shrink-0 focus-visible:outline-none"
                                />
                                <span>
                                  <span className="block font-semibold text-ink">{tk.name[lang]}</span>
                                  {tk.description[lang] && <span className="block text-sm text-ink-3">{tk.description[lang]}</span>}
                                </span>
                              </span>
                              <span className="font-display text-lg font-bold whitespace-nowrap text-blue">
                                {formatPrice(tk.amountCents, tk.currency, lang)}
                              </span>
                            </label>
                          );
                        })}
                        {err("ticket") && <FieldError id="field-ticket-error">{err("ticket")}</FieldError>}
                        <p className="text-sm text-ink-3">{t.fields.couponHint}</p>
                      </fieldset>
                      <div className="grid gap-5 sm:grid-cols-2">
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
                        <Checkbox checked={form.safetyConsent} onChange={(v) => update("safetyConsent", v)} invalid={!!err("safetyConsent")} describedBy="field-safetyConsent-error">
                          {consentBefore}
                          <a href={privacyHref} target="_blank" rel="noopener noreferrer" className={linkClass}>
                            {privacyLabel}
                          </a>
                          {consentAfter}
                        </Checkbox>
                        {err("safetyConsent") && <FieldError id="field-safetyConsent-error">{err("safetyConsent")}</FieldError>}
                      </div>
                      <Checkbox checked={form.optInOrganizer} onChange={(v) => update("optInOrganizer", v)}>
                        {t.fields.optInOrganizer}
                      </Checkbox>
                      <Checkbox checked={form.optInSponsors} onChange={(v) => update("optInSponsors", v)}>
                        {t.fields.optInSponsors}
                      </Checkbox>
                    </Section>

                    <Review t={t} lang={lang} form={form} ticket={selectedTicket} onEdit={goToStep} />
                  </>
                )}
              </div>

              {/* Honeypot: hidden from people and screen readers; bots fill it in. */}
              <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
                <label>
                  Website
                  <input tabIndex={-1} autoComplete="off" value={form.website} onChange={(e) => update("website", e.target.value)} />
                </label>
              </div>

              {step === LAST_STEP && turnstileSiteKey && <div ref={turnstileEl} className="min-h-16" />}

              {step < LAST_STEP ? (
                <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center">
                  {step > 0 && (
                    <Button variant="outline" size="lg" onClick={() => goToStep(step - 1)}>
                      {t.back}
                    </Button>
                  )}
                  <Button type="submit" variant="primary" size="lg" className="sm:ml-auto sm:min-w-44">
                    {t.next}
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  <Button type="submit" variant="primary" size="lg" className="w-full" loading={busy}>
                    {submitLabel}
                  </Button>
                  <Button variant="ghost" size="lg" className="w-full" onClick={() => goToStep(step - 1)} disabled={busy}>
                    {t.back}
                  </Button>
                  <p className="text-center text-sm text-ink-3">{t.securePayment}</p>
                </div>
              )}
            </form>
          </>
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
      <div className="flex items-center justify-between gap-4 text-sm">
        <span className="text-xs font-semibold uppercase tracking-wider text-gold-ink">{stepOf(current + 1, labels.length)}</span>
        <span className="font-semibold text-ink sm:hidden">{labels[current]}</span>
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
                aria-label={label}
                className="group block w-full rounded-sm py-1 text-left disabled:cursor-default"
              >
                <span
                  className={cx(
                    "block h-1.5 rounded-sm transition-colors duration-150",
                    done ? "bg-gold group-hover:bg-gold-hover" : active ? "bg-blue" : "bg-line"
                  )}
                />
                <span
                  className={cx(
                    "mt-2 hidden items-center gap-2 text-sm font-semibold sm:flex",
                    active ? "text-ink" : done ? "text-ink-2 group-hover:text-ink group-hover:underline" : "text-ink-3"
                  )}
                >
                  <span
                    aria-hidden="true"
                    className={cx(
                      "inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs",
                      done ? "bg-gold text-blue" : active ? "bg-blue text-white" : "border border-line-strong text-ink-3"
                    )}
                  >
                    {done ? <IconCheck className="h-3 w-3" /> : i + 1}
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
    <Card className="space-y-4 p-5 sm:p-6">
      <h2 className="font-display text-xl font-bold text-blue">{t.review.title}</h2>
      <dl className="divide-y divide-line">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center justify-between gap-4 py-2">
            <dt className="shrink-0 text-sm text-ink-3">{r.label}</dt>
            <dd className="flex min-w-0 items-center gap-2 text-right font-medium text-ink">
              <span className={cx("wrap-break-word", !r.value && "font-normal text-ink-3")}>{r.value || t.review.empty}</span>
              <Button variant="ghost" size="sm" onClick={() => onEdit(r.step)} aria-label={`${t.review.edit}: ${r.label}`}>
                {t.review.edit}
              </Button>
            </dd>
          </div>
        ))}
      </dl>
      <div className="on-dark flex items-end justify-between gap-4 rounded-md bg-blue px-5 py-4 text-white">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-white/65">{t.review.total}</div>
          <div className="text-sm text-white/80">{ticket ? ticket.name[lang] : t.review.noTicket}</div>
        </div>
        {ticket && <div className="font-display text-2xl font-bold">{formatPrice(ticket.amountCents, ticket.currency, lang)}</div>}
      </div>
    </Card>
  );
}

// ---------- small presentational helpers ----------

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card className="space-y-5 p-5 sm:p-6">
      <h2 className="font-display text-xl font-bold text-blue">{title}</h2>
      {children}
    </Card>
  );
}

function TextField({
  name,
  label,
  value,
  onChange,
  onBlur,
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
  onBlur?: () => void;
  error?: string;
  hint?: string;
  optionalLabel?: string;
  type?: string;
  autoComplete?: string;
  inputMode?: "email" | "tel" | "text";
}) {
  const id = `field-${name}`;
  return (
    <Field id={id} label={label} optionalLabel={optionalLabel} required={!optionalLabel} hint={hint} error={error}>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        autoComplete={autoComplete}
        inputMode={inputMode}
        className={inputClass(!!error)}
        aria-invalid={!!error}
        aria-describedby={describedBy(id, { hint, error })}
        required={!optionalLabel}
      />
    </Field>
  );
}

function CountryField({
  name,
  label,
  value,
  onChange,
  options,
  placeholder,
  noMatch,
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
  noMatch: (query: string) => string;
  error?: string;
  hint?: string;
  autoComplete?: string;
}) {
  const id = `field-${name}`;
  return (
    <Field id={id} label={label} required hint={hint} error={error}>
      <CountryCombobox
        id={id}
        value={value}
        onChange={onChange}
        options={options}
        placeholder={placeholder}
        noMatch={noMatch}
        invalid={!!error}
        describedBy={describedBy(id, { hint, error })}
        autoComplete={autoComplete === "country" ? "country-name" : undefined}
      />
    </Field>
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
    <fieldset id={`field-${name}`} className="space-y-2" aria-describedby={error ? `field-${name}-error` : undefined}>
      <legend className="mb-1.5 text-sm font-semibold text-ink">
        {label}
        <span className="ml-0.5 text-gold-ink" aria-hidden="true">
          *
        </span>
      </legend>
      <div className={inline ? "flex flex-wrap gap-2" : columns ? "grid gap-2 sm:grid-cols-2" : "grid gap-2"}>
        {options.map((o) => {
          const checked = value === o.value;
          return (
            <label
              key={o.value}
              className={cx(
                "flex min-h-12 cursor-pointer items-center gap-3 rounded-md border bg-surface px-4 py-2.5 text-base transition-colors duration-150 has-[:focus-visible]:border-blue has-[:focus-visible]:ring-1 has-[:focus-visible]:ring-blue",
                checked ? "border-ink text-ink ring-1 ring-ink" : error ? "border-danger text-ink-2" : "border-line-strong text-ink-2 hover:border-ink-3 hover:bg-canvas",
                inline && "min-w-28"
              )}
            >
              <input
                type="radio"
                name={name}
                value={o.value}
                checked={checked}
                onChange={() => onChange(o.value)}
                className="h-5 w-5 shrink-0 focus-visible:outline-none"
              />
              {o.label}
            </label>
          );
        })}
      </div>
      {error && <FieldError id={`field-${name}-error`}>{error}</FieldError>}
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
    <label className="flex cursor-pointer items-start gap-3 py-1 text-base leading-snug text-ink-2">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className={cx("mt-0.5 h-5 w-5 shrink-0", invalid && "outline-2 outline-offset-1 outline-danger")}
        aria-invalid={invalid || undefined}
        aria-describedby={invalid ? describedBy : undefined}
      />
      <span>{children}</span>
    </label>
  );
}
