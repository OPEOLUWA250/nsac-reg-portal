"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Button, buttonClass, Card, cx, Eyebrow, Field, inputClass, LanguageSwitch, linkClass } from "@/components/ui";
import { IconLinkedIn } from "@/components/icons";
import { preferredLanguage, setSiteLanguage } from "@/lib/site-language";
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
  firstName: string;
  lastName: string;
  jobTitle: string;
  organization: string;
  role: string | null;
  language: Language | null;
}

// One size for every platform (LinkedIn's 4:5 portrait).
const FORMAT: FlyerFormat = "portrait";
const START_FRAME: PhotoFrame = { zoom: 1, panX: 0, panY: 0 };

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
  partnerLogos = [],
}: {
  prefill: FlyerPrefill;
  backHref?: string;
  /** Image URLs for the partner-logo row (from public/brand/partners). */
  partnerLogos?: string[];
  /** Where the flyer's QR code points. */
  registerUrl: string;
}) {
  const [lang, setLang] = useState<Language>(prefill.language ?? "en");
  const t = FLYER_COPY[lang];

  const [headline, setHeadline] = useState<Headline>(prefill.role === "speaker" ? "speaking" : "attending");
  const [firstName, setFirstName] = useState(prefill.firstName);
  const [lastName, setLastName] = useState(prefill.lastName);
  const name = `${firstName.trim()} ${lastName.trim()}`.trim();
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

  // "Adjust photo" mode: on touch screens the preview only captures drags
  // (and pinches) while this is on, so the page scrolls normally otherwise.
  const [adjusting, setAdjusting] = useState(false);

  const partnerLogosKey = partnerLogos.join("|");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  // Fingers (or the mouse) on the preview, and where each gesture started.
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ frame: PhotoFrame; x: number; y: number; dist: number } | null>(null);

  const captionText = caption ?? t.defaultCaption(headline);

  // Language: registration language, else saved choice, else browser language.
  useEffect(() => {
    if (prefill.language) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reading browser-only settings after hydration
    setLang(preferredLanguage());
  }, [prefill.language]);

  // The header and footer follow the flyer's language.
  useEffect(() => {
    setSiteLanguage(lang);
  }, [lang]);

  // Brand fonts + logo must be loaded before drawing on the canvas.
  useEffect(() => {
    let cancelled = false;
    const display = cssFont("--font-raleway", "Arial, sans-serif");
    const body = cssFont("--font-dm-sans", "Arial, sans-serif");
    const logo = new Image();
    logo.src = "/brand/logo.png";
    const partners = partnerLogos.map((src) => {
      const img = new Image();
      img.src = src;
      return img;
    });
    // "Scan to register" QR code, drawn crisp at any size.
    const qr = document.createElement("canvas");
    Promise.allSettled([
      document.fonts.load(`700 40px ${display}`),
      document.fonts.load(`500 40px ${body}`),
      document.fonts.load(`600 40px ${body}`),
      document.fonts.load(`700 40px ${body}`),
      logo.decode(),
      ...partners.map((img) => img.decode()),
      QRCode.toCanvas(qr, registerUrl, { margin: 0, width: 480, errorCorrectionLevel: "M", color: { dark: "#0A1A31", light: "#FFFFFF" } }),
    ]).then((results) => {
      if (cancelled) return;
      const qrResult = results[results.length - 1];
      setAssets({
        logo: logo.complete && logo.naturalWidth ? logo : null,
        partners: partners.filter((img) => img.complete && img.naturalWidth > 0),
        qr: qrResult.status === "fulfilled" ? qr : null,
        fonts: { display, body },
      });
    });
    // Phones that can share images straight to LinkedIn / WhatsApp.
    try {
      const probe = new File([new Blob()], "x.jpg", { type: "image/jpeg" });
      // eslint-disable-next-line react-hooks/set-state-in-effect -- browser capability, only known after hydration
      setCanShareFiles(Boolean(navigator.canShare?.({ files: [probe] })));
    } catch {
      setCanShareFiles(false);
    }
    return () => {
      cancelled = true;
    };
    // partnerLogosKey stands in for the list (a new array each render).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registerUrl, partnerLogosKey]);

  const text: FlyerText = {
    name,
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
      if (canvasRef.current) drawFlyer(canvasRef.current, FORMAT, text, { ...assets, photo }, frame);
    });
    return () => cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `text` is derived from the listed values
  }, [assets, photo, frame, name, jobTitle, organization, headline, lang]);

  function chooseLang(next: Language) {
    setLang(next);
    setSiteLanguage(next, { remember: true });
  }

  async function onPhoto(file: File | undefined) {
    if (!file) return;
    setPhotoError(false);
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      photo?.close();
      setPhoto(bitmap);
      setFrame(initialFrame(bitmap));
      setAdjusting(false);
    } catch {
      setPhotoError(true);
    }
  }

  // Move the photo inside its circle by dragging; zoom with two fingers.
  // A mouse can always drag. Touch only in "Adjust photo" mode, so a finger
  // on the preview scrolls the page the rest of the time.
  const canAdjust = (e: React.PointerEvent) => Boolean(photo) && (e.pointerType === "mouse" || adjusting);

  // Midpoint and spread of the fingers on the preview.
  function spread() {
    const pts = [...pointers.current.values()];
    const x = pts.reduce((s, p) => s + p.x, 0) / pts.length;
    const y = pts.reduce((s, p) => s + p.y, 0) / pts.length;
    const dist = pts.length > 1 ? Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) : 0;
    return { x, y, dist };
  }

  function startGesture() {
    gesture.current = pointers.current.size ? { frame, ...spread() } : null;
  }

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!canAdjust(e)) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    startGesture();
  }

  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!photo || !pointers.current.has(e.pointerId) || !gesture.current) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const now = spread();
    const start = gesture.current;
    const rect = e.currentTarget.getBoundingClientRect();
    const toCanvas = FLYER_SIZES[FORMAT].width / rect.width;
    const r = photoRadius(FORMAT);
    const zoom = start.dist && now.dist ? Math.min(3, Math.max(1, start.frame.zoom * (now.dist / start.dist))) : start.frame.zoom;
    setFrame(
      clampFrame(photo, {
        zoom,
        panX: start.frame.panX + ((now.x - start.x) * toCanvas) / r,
        panY: start.frame.panY + ((now.y - start.y) * toCanvas) / r,
      })
    );
  }

  function onPointerUp(e: React.PointerEvent<HTMLCanvasElement>) {
    pointers.current.delete(e.pointerId);
    // The remaining finger (after a pinch) carries on from here.
    startGesture();
  }

  function startAdjusting() {
    setAdjusting(true);
    previewRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  // Keyboard: arrow keys move the photo inside its circle, + and - zoom.
  function onCanvasKey(e: React.KeyboardEvent<HTMLCanvasElement>) {
    if (!photo) return;
    const step = e.shiftKey ? 0.2 : 0.05;
    const moves: Record<string, Partial<PhotoFrame>> = {
      ArrowLeft: { panX: frame.panX - step },
      ArrowRight: { panX: frame.panX + step },
      ArrowUp: { panY: frame.panY - step },
      ArrowDown: { panY: frame.panY + step },
      "+": { zoom: Math.min(3, frame.zoom + 0.1) },
      "=": { zoom: Math.min(3, frame.zoom + 0.1) },
      "-": { zoom: Math.max(1, frame.zoom - 0.1) },
    };
    const move = moves[e.key];
    if (!move) return;
    e.preventDefault();
    setFrame(clampFrame(photo, { ...frame, ...move }));
  }

  const renderBlob = useCallback(async (): Promise<Blob | null> => {
    if (!assets) return null;
    const canvas = document.createElement("canvas");
    drawFlyer(canvas, FORMAT, text, { ...assets, photo }, frame);
    // JPEG: with a photo in it, a PNG is 2 to 3 times bigger for no visible
    // gain, and LinkedIn / WhatsApp recompress uploads anyway.
    return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `text` is derived from the listed values
  }, [assets, photo, frame, name, jobTitle, organization, headline, lang]);

  const filename = "newspace-africa-2027-flyer.jpg";

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
    const file = new File([blob], filename, { type: "image/jpeg" });
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

  const { width, height } = FLYER_SIZES[FORMAT];

  return (
    <main id="main" className="flex-1 px-4 py-8 sm:px-6 sm:py-12">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex flex-wrap-reverse items-end justify-between gap-4">
          <div className="min-w-0 flex-1 basis-48 space-y-2">
            <Eyebrow>{t.kicker}</Eyebrow>
            <h1 className="font-display text-3xl font-extrabold text-blue sm:text-4xl">{t.title}</h1>
          </div>
          <LanguageSwitch lang={lang} onChange={chooseLang} />
        </div>
        {/* Below the title row, so it uses the full width on phones. */}
        <p className="max-w-2xl text-base text-ink-2">{t.intro}</p>

        <div className="grid items-start gap-6 lg:grid-cols-2">
          {/* Controls */}
          <Card className="order-2 space-y-5 p-5 sm:p-6 lg:order-1">
            <Field id="flyer-photo" as="div" label={t.photo} hint={t.photoHint} error={photoError ? t.photoError : undefined}>
              <div className="flex flex-wrap items-center gap-3">
                <label className={buttonClass("secondary", "md", "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-blue")}>
                  {photo ? t.photoChange : t.photoChoose}
                  <input id="flyer-photo" type="file" accept="image/*" className="sr-only" onChange={(e) => onPhoto(e.target.files?.[0])} aria-describedby="flyer-photo-hint" />
                </label>
              </div>
            </Field>

            <div className="grid gap-5 sm:grid-cols-2">
              <Field id="flyer-first" label={t.firstName}>
                <input id="flyer-first" className={inputClass()} value={firstName} onChange={(e) => setFirstName(e.target.value)} maxLength={40} autoComplete="given-name" />
              </Field>
              <Field id="flyer-last" label={t.lastName}>
                <input id="flyer-last" className={inputClass()} value={lastName} onChange={(e) => setLastName(e.target.value)} maxLength={40} autoComplete="family-name" />
              </Field>
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field id="flyer-job" label={t.jobTitle}>
                <input id="flyer-job" className={inputClass()} value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} maxLength={120} />
              </Field>
              <Field id="flyer-org" label={t.organization}>
                <input id="flyer-org" className={inputClass()} value={organization} onChange={(e) => setOrganization(e.target.value)} maxLength={160} />
              </Field>
            </div>

            <Field id="flyer-headline" as="div" label={t.headline}>
              <Segmented
                value={headline}
                onChange={(h) => {
                  setHeadline(h);
                  setCaption(null);
                }}
                options={HEADLINES.map((h) => ({ value: h, label: t.headlines[h] }))}
              />
            </Field>


            <Field id="flyer-caption" label={t.caption} hint={t.captionHint}>
              <textarea id="flyer-caption" aria-describedby="flyer-caption-hint" className={inputClass()} rows={6} value={captionText} onChange={(e) => setCaption(e.target.value)} />
            </Field>
          </Card>

          {/* Preview + actions */}
          <div className="order-1 space-y-4 lg:sticky lg:top-24 lg:order-2">
            <div ref={previewRef} className="mx-auto max-w-xs scroll-mt-24 sm:max-w-md">
              <canvas
                ref={canvasRef}
                width={width}
                height={height}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
                tabIndex={photo ? 0 : -1}
                onKeyDown={onCanvasKey}
                className={cx(
                  "block h-auto w-full rounded-lg bg-blue transition-shadow duration-150",
                  photo && "cursor-grab active:cursor-grabbing",
                  // While adjusting: fingers move and zoom the photo instead of scrolling.
                  adjusting && "touch-none ring-4 ring-gold"
                )}
                role="img"
                aria-label={`${t.headlines[headline]} ${EVENT_INFO.name[lang]}: ${name}.${photo ? ` ${t.moveHint}` : ""}`}
              />
            </div>

            {!photo ? (
              <div className="flex justify-center">
                <label className={buttonClass("secondary", "lg", "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-blue")}>
                  {t.photoChoose}
                  <input type="file" accept="image/*" className="sr-only" onChange={(e) => onPhoto(e.target.files?.[0])} />
                </label>
              </div>
            ) : adjusting ? (
              <div className="mx-auto max-w-md space-y-3 rounded-lg border border-line bg-surface p-4 transition-opacity duration-150 starting:opacity-0" role="group" aria-label={t.adjust}>
                <p className="text-sm text-ink-2">{t.adjustHint}</p>
                <div className="flex items-center gap-3">
                  <label htmlFor="flyer-zoom" className="w-12 shrink-0 text-sm font-semibold text-ink-2">
                    {t.zoom}
                  </label>
                  <input
                    id="flyer-zoom"
                    type="range"
                    min={1}
                    max={3}
                    step={0.01}
                    value={frame.zoom}
                    onChange={(e) => setFrame((f) => clampFrame(photo, { ...f, zoom: Number(e.target.value) }))}
                    className="h-11 min-w-0 flex-1"
                  />
                </div>
                <Button variant="secondary" className="w-full" onClick={() => setAdjusting(false)}>
                  {t.adjustDone}
                </Button>
              </div>
            ) : (
              <div className="flex flex-wrap justify-center gap-2.5">
                <Button variant="outline" onClick={startAdjusting}>
                  {t.adjust}
                </Button>
                <label className={buttonClass("ghost", "md", "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-blue")}>
                  {t.photoChange}
                  <input type="file" accept="image/*" className="sr-only" onChange={(e) => onPhoto(e.target.files?.[0])} />
                </label>
              </div>
            )}

            <div className="flex flex-wrap justify-center gap-2.5">
              <Button variant="primary" onClick={handleLinkedIn} disabled={!assets} loading={busy}>
                <IconLinkedIn />
                {t.shareLinkedIn}
              </Button>
              {canShareFiles && (
                <Button variant="secondary" onClick={handleShare} disabled={busy || !assets}>
                  {t.share}
                </Button>
              )}
              <Button variant="outline" onClick={handleDownload} disabled={busy || !assets}>
                {t.download}
              </Button>
              <Button variant="ghost" onClick={handleCopy}>
                {t.copyCaption}
              </Button>
            </div>
            {message && (
              <div className="mx-auto max-w-md">
                <Alert tone="success">{message}</Alert>
              </div>
            )}
            {backHref && (
              <p className="text-center">
                <Link href={backHref} className={linkClass}>
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
          className={cx(
            "min-h-11 rounded-md border px-3.5 text-sm transition-colors duration-150",
            value === o.value ? "border-blue bg-surface font-semibold text-blue ring-1 ring-blue" : "border-line-strong bg-surface text-ink-2 hover:bg-subtle active:bg-line"
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
