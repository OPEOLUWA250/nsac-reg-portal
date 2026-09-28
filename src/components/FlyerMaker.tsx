"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Button, Card, Kicker } from "@/components/ui";
import { EVENT_INFO } from "@/lib/event-info";
import { FLYER_COPY, HEADLINES, type Headline } from "@/lib/flyer-copy";
import QRCode from "qrcode";
import {
  clampFrame,
  drawFlyer,
  FLYER_SIZES,
  initialFrame,
  photoRadius,
  type FlyerAssets,
  type FlyerFormat,
  type FlyerText,
  type PhotoFrame,
} from "@/lib/flyer-draw";
import type { Language } from "@/lib/registration-fields";

export interface FlyerPrefill {
  name: string;
  jobTitle: string;
  organization: string;
  role: string | null;
  language: Language | null;
}

const LANG_KEY = "nsac_lang";
const FORMATS: FlyerFormat[] = ["portrait", "story"];
const START_FRAME: PhotoFrame = { zoom: 1, panX: 0, panY: 0 };

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

// next/font exposes its generated font-family names as CSS variables.
function cssFont(variable: string, fallback: string) {
  const value = getComputedStyle(document.documentElement).getPropertyValue(variable).trim();
  return value ? `${value}, ${fallback}` : fallback;
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function FlyerMaker({
  prefill,
  backHref,
  registerUrl,
}: {
  prefill: FlyerPrefill;
  backHref?: string;
  /** Where the flyer's QR code points. */
  registerUrl: string;
}) {
  const [lang, setLang] = useState<Language>(prefill.language ?? "en");
  const t = FLYER_COPY[lang];

  const [format, setFormat] = useState<FlyerFormat>("portrait");
  const [headline, setHeadline] = useState<Headline>(prefill.role === "speaker" ? "speaking" : "attending");
  const [name, setName] = useState(prefill.name);
  const [jobTitle, setJobTitle] = useState(prefill.jobTitle);
  const [organization, setOrganization] = useState(prefill.organization);
  const [caption, setCaption] = useState<string | null>(null); // null = use the default text
  const [photo, setPhoto] = useState<ImageBitmap | null>(null);
  const [photoError, setPhotoError] = useState(false);
  const [frame, setFrame] = useState<PhotoFrame>(START_FRAME);
  const [assets, setAssets] = useState<Omit<FlyerAssets, "photo"> | null>(null);
  const [canShareFiles, setCanShareFiles] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drag = useRef<{ x: number; y: number; frame: PhotoFrame } | null>(null);

  const captionText = caption ?? t.defaultCaption(headline);

  // Language: registration language, else saved choice, else browser language.
  useEffect(() => {
    if (prefill.language) return;
    const saved = safeGet(LANG_KEY);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reading browser-only settings after hydration
    if (saved === "en" || saved === "fr") setLang(saved);
    else if (navigator.language?.toLowerCase().startsWith("fr")) setLang("fr");
  }, [prefill.language]);

  // Brand fonts + logo must be loaded before drawing on the canvas.
  useEffect(() => {
    let cancelled = false;
    const display = cssFont("--font-space-grotesk", "Arial, sans-serif");
    const body = cssFont("--font-inter", "Arial, sans-serif");
    const logo = new Image();
    logo.src = "/brand/logo.png";
    // "Scan to register" QR code, drawn crisp at any size.
    const qr = document.createElement("canvas");
    Promise.allSettled([
      document.fonts.load(`700 40px ${display}`),
      document.fonts.load(`500 40px ${body}`),
      document.fonts.load(`600 40px ${body}`),
      document.fonts.load(`700 40px ${body}`),
      logo.decode(),
      QRCode.toCanvas(qr, registerUrl, { margin: 0, width: 480, errorCorrectionLevel: "M", color: { dark: "#0A1A31", light: "#FFFFFF" } }),
    ]).then(([, , , , , qrResult]) => {
      if (cancelled) return;
      setAssets({
        logo: logo.complete && logo.naturalWidth ? logo : null,
        qr: qrResult.status === "fulfilled" ? qr : null,
        fonts: { display, body },
      });
    });
    // Phones that can share images straight to LinkedIn / WhatsApp.
    try {
      const probe = new File([new Blob()], "x.png", { type: "image/png" });
      // eslint-disable-next-line react-hooks/set-state-in-effect -- browser capability, only known after hydration
      setCanShareFiles(Boolean(navigator.canShare?.({ files: [probe] })));
    } catch {
      setCanShareFiles(false);
    }
    return () => {
      cancelled = true;
    };
  }, [registerUrl]);

  const text: FlyerText = {
    name: name.trim(),
    subtitle: [jobTitle.trim(), organization.trim()].filter(Boolean).join(" · "),
    headline: t.headlines[headline],
    eventName: EVENT_INFO.name[lang],
    tagline: t.tagline,
    mark: EVENT_INFO.mark,
    dateLabel: t.dateLabel,
    date: EVENT_INFO.date[lang],
    place: EVENT_INFO.place[lang],
    scanLabel: t.scanLabel,
    website: EVENT_INFO.website,
  };

  // Redraw the preview whenever anything changes.
  useEffect(() => {
    if (!assets || !canvasRef.current) return;
    const id = requestAnimationFrame(() => {
      if (canvasRef.current) drawFlyer(canvasRef.current, format, text, { ...assets, photo }, frame);
    });
    return () => cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `text` is derived from the listed values
  }, [assets, format, photo, frame, name, jobTitle, organization, headline, lang]);

  function chooseLang(next: Language) {
    setLang(next);
    safeSet(LANG_KEY, next);
  }

  async function onPhoto(file: File | undefined) {
    if (!file) return;
    setPhotoError(false);
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      photo?.close();
      setPhoto(bitmap);
      setFrame(initialFrame(bitmap));
    } catch {
      setPhotoError(true);
    }
  }

  // Drag the photo inside its circle (mouse or touch).
  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!photo) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, frame };
  }

  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drag.current || !photo) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const toCanvas = FLYER_SIZES[format].width / rect.width;
    const r = photoRadius(format);
    const start = drag.current.frame;
    setFrame(
      clampFrame(photo, {
        zoom: start.zoom,
        panX: start.panX + ((e.clientX - drag.current.x) * toCanvas) / r,
        panY: start.panY + ((e.clientY - drag.current.y) * toCanvas) / r,
      })
    );
  }

  function onPointerUp() {
    drag.current = null;
  }

  const renderBlob = useCallback(async (): Promise<Blob | null> => {
    if (!assets) return null;
    const canvas = document.createElement("canvas");
    drawFlyer(canvas, format, text, { ...assets, photo }, frame);
    return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `text` is derived from the listed values
  }, [assets, format, photo, frame, name, jobTitle, organization, headline, lang]);

  const filename = `newspace-africa-2027-${format}.png`;

  async function handleDownload() {
    setBusy(true);
    setMessage("");
    const blob = await renderBlob();
    if (blob) downloadBlob(blob, filename);
    setBusy(false);
  }

  // Desktop-friendly: LinkedIn can't receive an image from a website, so we
  // download it, copy the text, and open LinkedIn's post box pre-filled.
  async function handleLinkedIn() {
    const url = `https://www.linkedin.com/feed/?shareActive=true&text=${encodeURIComponent(captionText)}`;
    // Open the tab inside the click so pop-up blockers allow it.
    const tab = window.open(url, "_blank");
    if (tab) tab.opener = null;
    setBusy(true);
    const [blob] = await Promise.all([renderBlob(), copyText(captionText)]);
    if (blob) downloadBlob(blob, filename);
    setBusy(false);
    setMessage(t.linkedInSteps);
    if (!tab) window.location.href = url; // pop-up blocked: go there directly
  }

  // Phones: the system share sheet, with the image attached (LinkedIn,
  // WhatsApp, Instagram…). The text is also copied, as some apps drop it.
  async function handleShare() {
    setBusy(true);
    setMessage("");
    const [blob] = await Promise.all([renderBlob(), copyText(captionText)]);
    setBusy(false);
    if (!blob) return;
    const file = new File([blob], filename, { type: "image/png" });
    try {
      await navigator.share({ files: [file], text: captionText, title: EVENT_INFO.name[lang] });
    } catch (err) {
      if ((err as Error).name === "AbortError") return; // user closed the share sheet
      downloadBlob(blob, filename);
      setMessage(t.shareFallback);
    }
  }

  async function handleCopy() {
    if (await copyText(captionText)) setMessage(t.copied);
  }

  const { width, height } = FLYER_SIZES[format];

  return (
    <main className="flex-1 brand-glow px-4 py-8 sm:py-12">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <Kicker>{t.kicker}</Kicker>
            <h1 className="font-display text-3xl sm:text-4xl text-navy">{t.title}</h1>
            <p className="text-navy/65 text-[15px] leading-relaxed max-w-2xl">{t.intro}</p>
          </div>
          <div className="inline-flex shrink-0 rounded-full border border-navy/15 bg-white p-0.5 text-xs font-semibold" role="group" aria-label="Language / Langue">
            {(["en", "fr"] as const).map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => chooseLang(l)}
                aria-pressed={lang === l}
                className={`rounded-full px-3 py-1.5 uppercase tracking-wider ${lang === l ? "bg-navy text-white" : "text-navy/60 hover:text-navy"}`}
              >
                {l}
              </button>
            ))}
          </div>
        </div>

        <div className="grid lg:grid-cols-[1fr_1.1fr] gap-6 items-start">
          {/* Controls */}
          <Card className="p-5 sm:p-7 space-y-5 order-2 lg:order-1">
            <Field label={t.photo} hint={t.photoHint}>
              <div className="flex flex-wrap items-center gap-3">
                <label className="inline-flex cursor-pointer items-center rounded-full bg-navy text-white px-5 py-2.5 text-sm font-semibold hover:bg-blue-2 transition-colors focus-within:ring-2 focus-within:ring-gold/50">
                  {photo ? t.photoChange : t.photoChoose}
                  <input type="file" accept="image/*" className="sr-only" onChange={(e) => onPhoto(e.target.files?.[0])} />
                </label>
                {photoError && (
                  <span className="text-sm text-red-600">
                    {lang === "fr" ? "Impossible de lire cette image. Essayez une photo JPG ou PNG." : "Couldn't read that image. Try a JPG or PNG photo."}
                  </span>
                )}
              </div>
              {photo && (
                <div className="flex items-center gap-3 pt-3">
                  <span className="text-xs font-semibold uppercase tracking-wider text-navy/55 w-12">{t.zoom}</span>
                  <input
                    type="range"
                    min={1}
                    max={3}
                    step={0.01}
                    value={frame.zoom}
                    onChange={(e) => setFrame((f) => clampFrame(photo, { ...f, zoom: Number(e.target.value) }))}
                    className="flex-1 accent-[var(--gold)]"
                    aria-label={t.zoom}
                  />
                </div>
              )}
            </Field>

            <div className="grid sm:grid-cols-2 gap-4">
              <Field label={t.name}>
                <input className={INPUT} value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder={t.namePlaceholder} />
              </Field>
              <Field label={t.jobTitle}>
                <input className={INPUT} value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} maxLength={120} />
              </Field>
            </div>
            <Field label={t.organization}>
              <input className={INPUT} value={organization} onChange={(e) => setOrganization(e.target.value)} maxLength={160} />
            </Field>

            <Field label={t.headline}>
              <Segmented
                value={headline}
                onChange={(h) => {
                  setHeadline(h);
                  setCaption(null);
                }}
                options={HEADLINES.map((h) => ({ value: h, label: t.headlines[h] }))}
              />
            </Field>

            <Field label={t.format}>
              <Segmented value={format} onChange={setFormat} options={FORMATS.map((f) => ({ value: f, label: t.formats[f] }))} />
            </Field>

            <Field label={t.caption} hint={t.captionHint}>
              <textarea className={INPUT} rows={6} value={captionText} onChange={(e) => setCaption(e.target.value)} />
            </Field>
          </Card>

          {/* Preview + actions */}
          <div className="space-y-4 order-1 lg:order-2 lg:sticky lg:top-24">
            <div className={`mx-auto ${format === "story" ? "max-w-[340px]" : "max-w-[560px]"}`}>
              <canvas
                ref={canvasRef}
                width={width}
                height={height}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
                className={`block w-full h-auto rounded-2xl shadow-[0_10px_28px_-12px_rgba(10,26,49,0.45)] bg-navy touch-none ${photo ? "cursor-grab active:cursor-grabbing" : ""}`}
                role="img"
                aria-label={`${t.headlines[headline]} ${EVENT_INFO.name[lang]} — ${name}`}
              />
            </div>

            {!photo && (
              <div className="flex justify-center">
                <label className="inline-flex cursor-pointer items-center rounded-full bg-navy text-white px-6 py-3 text-sm font-semibold hover:bg-blue-2 transition-colors focus-within:ring-2 focus-within:ring-gold/50">
                  {t.photoChoose}
                  <input type="file" accept="image/*" className="sr-only" onChange={(e) => onPhoto(e.target.files?.[0])} />
                </label>
              </div>
            )}

            <div className="flex flex-wrap justify-center gap-2.5">
              <Button variant="gold" onClick={handleLinkedIn} disabled={busy || !assets}>
                <LinkedInIcon />
                {t.shareLinkedIn}
              </Button>
              {canShareFiles && (
                <Button variant="navy" onClick={handleShare} disabled={busy || !assets}>
                  {t.share}
                </Button>
              )}
              <Button variant="outline" onClick={handleDownload} disabled={busy || !assets}>
                {busy ? t.rendering : t.download}
              </Button>
              <Button variant="ghost" onClick={handleCopy}>
                {t.copyCaption}
              </Button>
            </div>
            {message && (
              <p role="status" className="text-sm text-navy bg-gold/10 border border-gold/30 rounded-lg px-3 py-2 max-w-[560px] mx-auto">
                {message}
              </p>
            )}
            {backHref && (
              <p className="text-center">
                <Link href={backHref} className="text-sm font-semibold text-navy underline decoration-gold">
                  {t.backToTicket}
                </Link>
              </p>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}

const INPUT =
  "w-full rounded-lg border border-navy/15 bg-white px-4 py-2.5 text-[16px] text-navy placeholder:text-navy/35 outline-none focus:border-gold focus:ring-2 focus:ring-gold/25";

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="text-sm font-semibold text-navy">{label}</div>
      {children}
      {hint && <p className="text-xs text-navy/50">{hint}</p>}
    </div>
  );
}

function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          aria-pressed={value === o.value}
          className={`rounded-lg border px-3.5 py-2 text-sm transition-colors ${
            value === o.value ? "border-gold bg-gold/[0.08] text-navy font-semibold" : "border-navy/15 text-navy/75 hover:border-navy/30"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function LinkedInIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
      <path d="M20.45 20.45h-3.56v-5.57c0-1.33-.02-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.35V9h3.41v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28zM5.34 7.43a2.06 2.06 0 1 1 0-4.13 2.06 2.06 0 0 1 0 4.13zM7.12 20.45H3.56V9h3.56v11.45zM22.22 0H1.77C.79 0 0 .77 0 1.73v20.54C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.73V1.73C24 .77 23.2 0 22.22 0z" />
    </svg>
  );
}
