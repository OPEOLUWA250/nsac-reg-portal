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
import { IconAlert, IconCheck } from "@/components/icons";
import CountryCombobox from "@/components/CountryCombobox";
import { clearDraft, readDraft, saveDraft } from "@/lib/registration-draft";
import { preferredLanguage, setSiteLanguage } from "@/lib/site-language";
import { COPY } from "@/lib/registration-copy";
import {
  JOB_FUNCTIONS,
  PASSPORT_MAX_BYTES,
  PASSPORT_MIME_TYPES,
  PROFESSIONAL_CATEGORIES,
  validateRegistration,
  registrationAgreementErrors,
  type FieldError as FieldErrorCode,
  type FieldName,
  type Language,
  type ValidationErrors,
} from "@/lib/registration-fields";
import { COUNTRY_CODES, EUROPEAN_VAT_COUNTRIES } from "@/lib/countries";
import { discountedCents, formatPrice, requiresVipPayment, STUDENT_TICKET_ID } from "@/lib/tickets";
import { REGISTRATION_CATEGORIES, type RegistrationCategory } from "@/lib/types";
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
  category: string;
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
  shareDetails: string;
  promoCode: string;
  studentCode: string;
  optInOrganizer: boolean;
  optInSponsors: boolean;
  website: string; // honeypot — must stay empty
}

const EMPTY: FormState = {
  category: "",
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
  shareDetails: "",
  promoCode: "",
  studentCode: "",
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

// The three steps, and the fields each one asks for — used to check a step
// before moving on, and to jump back to the step that has an error.
const STEP_FIELDS: FieldName[][] = [
  ["category", "firstName", "lastName", "email", "jobTitle", "phone", "nationality", "residenceCountry"],
  ["organization", "organizationCountry", "professionalCategory", "jobFunction", "invitationLetter", "passport", "foodAllergies"],
  ["ticket", "promoCode", "studentCode", "vatNumber", "invoiceId", "safetyConsent", "shareDetails", "optInOrganizer", "optInSponsors"],
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
  // True when answers from an earlier visit were restored ("Welcome back").
  const [resumed, setResumed] = useState(false);
  // A promo code the server has confirmed (shown as a discount before payment).
  const [appliedPromo, setAppliedPromo] = useState<{ code: string; percentOff: number } | null>(null);
  const [checkingPromo, setCheckingPromo] = useState(false);
  const [checkingEmail, setCheckingEmail] = useState(false);
  // The email as typed right now, for answers that arrive after it changed.
  const currentEmail = useRef(form.email);
  useEffect(() => {
    currentEmail.current = form.email;
  }, [form.email]);
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

  // Restore answers saved in this browser (a refresh, a closed tab, or back
  // from a cancelled payment, then straight to the last step), on the step
  // the visitor had reached.
  useEffect(() => {
    const draft = readDraft();
    if (!draft) return;
    const saved = draft.form as Partial<FormState>;
    // A ticket that has since gone off sale (e.g. Early Bird ended) is dropped.
    const ticketStillOnSale = tickets.some((tk) => tk.id === saved.ticket);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- restoring a draft saved in this browser
    setForm((f) => ({ ...f, ...saved, ticket: ticketStillOnSale ? (saved.ticket as string) : f.ticket, website: "" }));
    if (draft.id) submissionId.current = draft.id;
    const savedStep = Math.min(Math.max(0, draft.step), LAST_STEP);
    setStep(paymentCancelled ? LAST_STEP : savedStep);
    // "Welcome back" only when there's something to come back to.
    if (!paymentCancelled && (savedStep > 0 || Object.values(saved).some((v) => typeof v === "string" && v.trim()))) {
      setResumed(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only on first load
  }, []);

  /** Forgets the saved answers and starts a new registration on step 1. */
  function startOver() {
    clearDraft();
    dirty.current = false;
    submissionId.current = "";
    setForm({ ...EMPTY, ticket: tickets.length === 1 ? tickets[0].id : "" });
    setPassportFile(null);
    setErrors({});
    setBanner("");
    setNotice("");
    setResumed(false);
    setAppliedPromo(null);
    setStep(0);
    setPhase({ kind: "editing" });
  }

  // Browsers keep a frozen copy of this page when we send the visitor to
  // Stripe. Coming back (Back button) restores it mid-"redirecting", with
  // the button disabled — so reset it to a usable state.
  useEffect(() => {
    const onPageShow = (e: PageTransitionEvent) => {
      if (!e.persisted) return;
      setNotice("");
      setBanner("");
      if (readDraft()) {
        // Came back from Stripe without paying: keep their answers.
        setPhase((p) => (p.kind === "already_registered" ? p : { kind: "editing" }));
        return;
      }
      // The draft is gone: payment succeeded (the success page clears it).
      // Start a fresh registration on step 1.
      startOver();
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- startOver only uses setters and refs
  }, [tickets]);

  useEffect(() => {
    if (!dirty.current) return;
    saveDraft({ form: { ...form, website: "" }, step, id: submissionId.current || undefined });
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
    if (key === "promoCode") setAppliedPromo(null);
    if (key === "ticket" && value === STUDENT_TICKET_ID) {
      // Students register as Delegates, and promo codes don't apply.
      setAppliedPromo(null);
      setForm((f) => ({ ...f, ticket: value as string, category: "delegate", promoCode: "" }));
      setErrors((e) => ({ ...e, ticket: undefined, category: undefined, promoCode: undefined }));
      return;
    }
    // Some codes only work with certain tickets: check again for the new one.
    if (key === "ticket" && appliedPromo && value !== form.ticket) applyPromo(appliedPromo.code, value as string);
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => (key in e ? { ...e, [key]: undefined } : e));
  }

  const selectedTicket = tickets.find((tk) => tk.id === form.ticket);
  const priceCents = selectedTicket
    ? appliedPromo
      ? discountedCents(selectedTicket.amountCents, appliedPromo.percentOff)
      : selectedTicket.amountCents
    : null;

  async function applyPromo(code = form.promoCode, ticket = form.ticket) {
    const typed = code.trim().toUpperCase();
    if (!typed) return;
    setCheckingPromo(true);
    setErrors((e) => ({ ...e, promoCode: undefined }));
    try {
      const res = await fetch("/api/promo/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: typed, ticket }),
        signal: AbortSignal.timeout(20_000),
      });
      const json = await res.json();
      if (json.ok) setAppliedPromo({ code: json.code, percentOff: json.percentOff });
      else {
        setAppliedPromo(null);
        setErrors((e) => ({ ...e, promoCode: json.error ?? "promo_unknown" }));
      }
    } catch {
      setAppliedPromo(null);
      setErrors((e) => ({ ...e, promoCode: "promo_unavailable" }));
    } finally {
      setCheckingPromo(false);
    }
  }

  function removePromo() {
    setAppliedPromo(null);
    update("promoCode", "");
  }

  // A code saved from an earlier visit is checked again when the ticket step shows.
  const restoredPromoChecked = useRef(false);
  useEffect(() => {
    if (step !== LAST_STEP || restoredPromoChecked.current || !form.promoCode || appliedPromo) return;
    restoredPromoChecked.current = true;
    applyPromo();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, when reaching the ticket step
  }, [step]);
  const vatRequired = EUROPEAN_VAT_COUNTRIES.has(form.organizationCountry);
  const busy = phase.kind !== "editing" && phase.kind !== "already_registered";

  const payload = useMemo(
    () => ({
      ...form,
      promoCode: appliedPromo?.code ?? form.promoCode,
      language: lang,
      passport: passportFile ? { mime: passportFile.type, size: passportFile.size } : null,
    }),
    [form, lang, passportFile, appliedPromo]
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

  // One registration per email: ask the server before leaving step 1, so
  // nobody fills in the whole form to find out at the end. null = couldn't
  // check (the server checks again when the form is sent).
  async function emailTaken(email: string): Promise<boolean | null> {
    try {
      const res = await fetch("/api/register/check-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) return null;
      return (await res.json()).taken === true;
    } catch {
      return null;
    }
  }

  async function handleNext() {
    if (!submissionId.current) submissionId.current = crypto.randomUUID();
    const check = validateRegistration({ ...payload, id: submissionId.current }, tickets.map((tk) => tk.id));
    const stepErrs = check.ok ? {} : errorsForStep(check.errors, step);
    if (step === 0 && !stepErrs.email && form.email.trim()) {
      setCheckingEmail(true);
      const taken = await emailTaken(form.email);
      setCheckingEmail(false);
      if (taken) stepErrs.email = "email_taken";
    }
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

    if (priceCents !== null && requiresVipPayment(form.category, priceCents)) {
      showErrors({ [appliedPromo ? "promoCode" : "ticket"]: "vip_payment_required" });
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
  const missingAgreement = Object.keys(registrationAgreementErrors({ ...form }))[0];
  const agreementsComplete = !missingAgreement;
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
    if (code) {
      setErrors((e) => ({ ...e, [name]: code }));
      return;
    }
    // A well-formed email: is it already registered?
    if (name === "email") {
      const typed = value;
      emailTaken(typed).then((taken) => {
        if (taken && currentEmail.current === typed) setErrors((e) => ({ ...e, email: "email_taken" }));
      });
    }
  }

  const submitLabel =
    phase.kind === "submitting"
      ? t.submitting
      : phase.kind === "uploading"
        ? t.uploading(phase.pct)
        : phase.kind === "redirecting"
          ? t.redirecting
          : selectedTicket && priceCents === 0 && form.category !== "vip"
            ? t.submitFree
            : t.submit(selectedTicket && priceCents !== null ? formatPrice(priceCents, selectedTicket.currency, lang) : "").replace(/ · $/, "");

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
              {resumed && !paymentCancelled && !banner && (
                <Alert
                  tone="info"
                  title={t.resumed.title}
                  action={
                    <Button variant="ghost" size="sm" onClick={startOver}>
                      {t.resumed.startOver}
                    </Button>
                  }
                >
                  {t.resumed.body}
                </Alert>
              )}
              {banner && <Alert tone="error">{banner}</Alert>}
              {notice && <Alert tone="info">{notice}</Alert>}

              <StepProgress labels={t.steps} current={step} stepOf={t.stepOf} onJump={goToStep} />

              {/* Keyed by step so each step fades in. */}
              <div key={step} className="space-y-6 transition-opacity duration-150 starting:opacity-0">
                {step === 0 && (
                  <Section title={t.sections.you}>
                    <RadioGroup
                      name="category"
                      label={t.fields.category}
                      hint={t.fields.categoryHint}
                      value={form.category}
                      onChange={(v) => update("category", v)}
                      options={REGISTRATION_CATEGORIES.map((c) => ({ value: c, label: t.categories[c] }))}
                      error={err("category")}
                      columns
                    />
                    <div className="grid gap-5 sm:grid-cols-2">
                      <TextField name="firstName" label={t.fields.firstName} value={form.firstName} onChange={(v) => update("firstName", v)} error={err("firstName")} autoComplete="given-name" />
                      <TextField name="lastName" label={t.fields.lastName} value={form.lastName} onChange={(v) => update("lastName", v)} error={err("lastName")} autoComplete="family-name" />
                    </div>
                    <TextField name="email" type="email" label={t.fields.email} hint={t.fields.emailHint} value={form.email} onChange={(v) => update("email", v)} onBlur={() => checkField("email")} error={err("email")} autoComplete="email" inputMode="email" />
                    <TextField name="jobTitle" label={t.fields.jobTitle} value={form.jobTitle} onChange={(v) => update("jobTitle", v)} error={err("jobTitle")} autoComplete="organization-title" />
                    <TextField name="phone" type="tel" label={t.fields.phone} hint={t.fields.phoneHint} value={form.phone} onChange={(v) => update("phone", v)} onBlur={() => checkField("phone")} error={err("phone")} autoComplete="tel" inputMode="tel" />
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
                      </fieldset>
                      {form.ticket === STUDENT_TICKET_ID ? (
                        <Field id="field-studentCode" label={t.fields.studentCode} required hint={t.fields.studentCodeHint} error={err("studentCode")}>
                          <input
                            id="field-studentCode"
                            className={inputClass(!!err("studentCode"), "font-mono uppercase")}
                            value={form.studentCode}
                            onChange={(e) => update("studentCode", e.target.value.toUpperCase())}
                            autoComplete="off"
                            autoCapitalize="characters"
                            spellCheck={false}
                            maxLength={20}
                            required
                            aria-invalid={!!err("studentCode")}
                            aria-describedby={describedBy("field-studentCode", { hint: true, error: err("studentCode") })}
                          />
                          <p className="mt-2 text-sm text-ink-3">{t.fields.studentDelegate}</p>
                        </Field>
                      ) : (
                      <Field id="field-promoCode" label={t.fields.promoCode} optionalLabel={t.optional} hint={appliedPromo ? undefined : t.fields.promoHint} error={err("promoCode")}>
                        {appliedPromo ? (
                          <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-success bg-surface px-4 py-3">
                            <span className="flex items-center gap-2 text-base font-semibold text-success">
                              <IconCheck className="h-5 w-5 shrink-0" />
                              {t.promo.applied(appliedPromo.code, appliedPromo.percentOff)}
                            </span>
                            <Button variant="ghost" size="sm" onClick={removePromo}>
                              {t.promo.remove}
                            </Button>
                          </div>
                        ) : (
                          <div className="flex gap-2">
                            <input
                              id="field-promoCode"
                              className={inputClass(!!err("promoCode"), "font-mono uppercase")}
                              value={form.promoCode}
                              onChange={(e) => update("promoCode", e.target.value.toUpperCase())}
                              onKeyDown={(e) => {
                                // Enter applies the code rather than submitting the form.
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  applyPromo();
                                }
                              }}
                              autoComplete="off"
                              autoCapitalize="characters"
                              spellCheck={false}
                              maxLength={40}
                              aria-invalid={!!err("promoCode")}
                              aria-describedby={describedBy("field-promoCode", { hint: true, error: err("promoCode") })}
                            />
                            <Button variant="outline" className="shrink-0" onClick={() => applyPromo()} loading={checkingPromo} disabled={!form.promoCode.trim()}>
                              {checkingPromo ? t.promo.checking : t.promo.apply}
                            </Button>
                          </div>
                        )}
                      </Field>
                      )}
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
                        <Checkbox required checked={form.safetyConsent} onChange={(v) => update("safetyConsent", v)} invalid={!!err("safetyConsent")} describedBy="field-safetyConsent-error">
                          {consentBefore}
                          <a href={privacyHref} target="_blank" rel="noopener noreferrer" className={linkClass}>
                            {privacyLabel}
                          </a>
                          {consentAfter}
                        </Checkbox>
                        {err("safetyConsent") && <FieldError id="field-safetyConsent-error">{err("safetyConsent")}</FieldError>}
                      </div>
                      <RadioGroup
                        name="shareDetails"
                        label={t.fields.shareDetails}
                        hint={t.fields.shareDetailsHint}
                        value={form.shareDetails}
                        onChange={(v) => update("shareDetails", v)}
                        options={[
                          { value: "yes", label: t.shareYes },
                          { value: "no", label: t.shareNo },
                        ]}
                        error={err("shareDetails")}
                        columns
                      />
                      <div id="field-optInOrganizer" className="space-y-1.5">
                        <Checkbox required checked={form.optInOrganizer} onChange={(v) => update("optInOrganizer", v)} invalid={!!err("optInOrganizer")} describedBy="field-optInOrganizer-error">
                          {t.fields.optInOrganizer}
                        </Checkbox>
                        {err("optInOrganizer") && <FieldError id="field-optInOrganizer-error">{err("optInOrganizer")}</FieldError>}
                      </div>
                      <div id="field-optInSponsors" className="space-y-1.5">
                        <Checkbox required checked={form.optInSponsors} onChange={(v) => update("optInSponsors", v)} invalid={!!err("optInSponsors")} describedBy="field-optInSponsors-error">
                          {t.fields.optInSponsors}
                        </Checkbox>
                        {err("optInSponsors") && <FieldError id="field-optInSponsors-error">{err("optInSponsors")}</FieldError>}
                      </div>
                    </Section>

                    <Review t={t} lang={lang} form={form} ticket={selectedTicket} promo={appliedPromo} priceCents={priceCents} onEdit={goToStep} />
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
                  <Button type="submit" variant="primary" size="lg" className="sm:ml-auto sm:min-w-44" loading={checkingEmail}>
                    {t.next}
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  {/* Checkout and the API enforce the same agreement requirements. */}
                  {!agreementsComplete && (
                    <p id="agree-first" className="flex items-start justify-center gap-1.5 text-center text-sm font-medium text-ink-2">
                      <IconAlert className="mt-0.5 h-4 w-4 shrink-0 text-gold-ink" />
                      <span>
                        {t.agreeFirst}{" "}
                        <button
                          type="button"
                          className={linkClass}
                          onClick={() => {
                            const box = document.querySelector<HTMLInputElement>(`#field-${missingAgreement} input`);
                            box?.scrollIntoView({ behavior: "smooth", block: "center" });
                            box?.focus({ preventScroll: true });
                          }}
                        >
                          {t.agreeFirstLink}
                        </button>
                      </span>
                    </p>
                  )}
                  <Button
                    type="submit"
                    variant="primary"
                    size="lg"
                    className="w-full"
                    loading={busy}
                    disabled={!agreementsComplete}
                    aria-describedby={agreementsComplete ? undefined : "agree-first"}
                  >
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
  promo,
  priceCents,
  onEdit,
}: {
  t: (typeof COPY)[Language];
  lang: Language;
  form: FormState;
  ticket: TicketOption | undefined;
  promo: { code: string; percentOff: number } | null;
  priceCents: number | null;
  onEdit: (step: number) => void;
}) {
  const rows: { label: string; value: string; step: number }[] = [
    {
      label: t.fields.category,
      // Students are registered as Delegates (the server does the same).
      value: t.categories[(ticket?.id === STUDENT_TICKET_ID ? "delegate" : form.category) as RegistrationCategory] ?? "",
      step: 0,
    },
    { label: t.review.name, value: `${form.firstName} ${form.lastName}`.trim(), step: 0 },
    { label: t.review.email, value: form.email, step: 0 },
    { label: t.review.organization, value: [form.jobTitle, form.organization].filter(Boolean).join(" · "), step: 1 },
  ];
  return (
    <Card className="space-y-4 p-5 sm:p-6">
      <h2 className="font-display text-xl font-bold text-blue">{t.review.title}</h2>
      <dl className="divide-y divide-line">
        {/* Label above the value, Edit on the right: a long email address
            (no spaces to wrap at) breaks inside its column instead of
            pushing the row off the screen on phones. */}
        {rows.map((r) => (
          <div key={r.label} className="flex items-center gap-3 py-2.5">
            <div className="min-w-0 flex-1">
              <dt className="text-sm text-ink-3">{r.label}</dt>
              <dd className={cx("font-medium text-ink [overflow-wrap:anywhere]", !r.value && "font-normal text-ink-3")}>
                {r.value || t.review.empty}
              </dd>
            </div>
            <Button variant="ghost" size="sm" className="shrink-0" onClick={() => onEdit(r.step)} aria-label={`${t.review.edit}: ${r.label}`}>
              {t.review.edit}
            </Button>
          </div>
        ))}
      </dl>
      <div className="on-dark flex items-end justify-between gap-4 rounded-md bg-blue px-5 py-4 text-white">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-white/65">{t.review.total}</div>
          <div className="text-sm text-white/80">{ticket ? ticket.name[lang] : t.review.noTicket}</div>
          {ticket && promo && (
            <div className="text-sm text-gold">
              {t.review.discount} {promo.code} (−{promo.percentOff}%)
            </div>
          )}
        </div>
        {ticket && priceCents !== null && (
          <div className="text-right">
            {promo && <div className="text-sm text-white/65 line-through">{formatPrice(ticket.amountCents, ticket.currency, lang)}</div>}
            <div className="font-display text-2xl font-bold">{priceCents === 0 ? t.promo.free : formatPrice(priceCents, ticket.currency, lang)}</div>
          </div>
        )}
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
  hint,
  inline,
  columns,
}: {
  name: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  error?: string;
  hint?: string;
  inline?: boolean;
  columns?: boolean;
}) {
  return (
    <fieldset id={`field-${name}`} className="space-y-2" aria-describedby={describedBy(`field-${name}`, { hint, error })}>
      <legend className="mb-1.5 text-sm font-semibold text-ink">
        {label}
        <span className="ml-0.5 text-gold-ink" aria-hidden="true">
          *
        </span>
      </legend>
      {hint && (
        <p id={`field-${name}-hint`} className="-mt-1 text-sm text-ink-3">
          {hint}
        </p>
      )}
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
                required
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
  required,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  children: ReactNode;
  invalid?: boolean;
  describedBy?: string;
  /** Shows the gold * like other required fields. */
  required?: boolean;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 py-1 text-base leading-snug text-ink-2">
      <input
        type="checkbox"
        required={required}
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className={cx("mt-0.5 h-5 w-5 shrink-0", invalid && "outline-2 outline-offset-1 outline-danger")}
        aria-invalid={invalid || undefined}
        aria-describedby={invalid ? describedBy : undefined}
        aria-required={required || undefined}
      />
      <span>
        {children}
        {required && (
          <span className="ml-0.5 text-gold-ink" aria-hidden="true">
            *
          </span>
        )}
      </span>
    </label>
  );
}
