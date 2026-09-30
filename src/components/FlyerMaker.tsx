"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Button, buttonClass, Card, cx, Eyebrow, Field, inputClass, LanguageSwitch, linkClass } from "@/components/ui";
import { IconDownload, IconLinkedIn, IconShare } from "@/components/icons";
import { usePopover } from "@/components/usePopover";
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

  // Computers (no share sheet): open the chosen app ready to post, with the
  // image downloaded and the text copied, since websites can't attach an
  // image to another app. Instagram has no web posting, so just the file.
  async function handleShareTo(app: ShareApp) {
    const text = encodeURIComponent(captionText);
    const url =
      app === "whatsapp"
        ? `https://wa.me/?text=${text}`
        : app === "x"
          ? `https://twitter.com/intent/tweet?text=${text}`
          : app === "facebook"
            ? `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(EVENT_INFO.websiteUrl)}`
            : app === "email"
              ? `mailto:?subject=${encodeURIComponent(EVENT_INFO.name[lang])}&body=${text}`
              : null;
    // Open the tab inside the click so pop-up blockers allow it.
    const tab = url && app !== "email" ? window.open(url, "_blank") : null;
    if (tab) tab.opener = null;
    setBusy(true);
    setMessage("");
    const [blob] = await Promise.all([renderBlob(), copyText(captionText)]);
    if (blob) downloadBlob(blob, filename);
    setBusy(false);
    setMessage(app === "instagram" ? t.instagramSteps : t.sharedTo(t.apps[app]));
    if (app === "email" && url) window.location.href = url;
    else if (url && !tab) window.location.href = url; // pop-up blocked: go there directly
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

        {/* Phones: preview, then the options, then sharing, in the order
            people work. Wider screens: options on the left, preview and
            sharing on the right. */}
        <div className="grid items-start gap-6 lg:grid-cols-2">
          {/* Preview + photo */}
          <div className="order-1 space-y-4 lg:col-start-2 lg:row-start-1">
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
              <div className="mx-auto max-w-md space-y-2 text-center">
                <label className={buttonClass("secondary", "lg", "w-full sm:w-auto has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-blue")}>
                  {t.photoChoose}
                  <input type="file" accept="image/*" className="sr-only" onChange={(e) => onPhoto(e.target.files?.[0])} aria-describedby="flyer-photo-hint" />
                </label>
                <p id="flyer-photo-hint" className="text-sm text-ink-3">
                  {t.photoHint}
                </p>
                {photoError && <Alert tone="error">{t.photoError}</Alert>}
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
              <div className="mx-auto grid max-w-md grid-cols-2 gap-2">
                <Button variant="outline" onClick={startAdjusting}>
                  {t.adjust}
                </Button>
                <label className={buttonClass("outline", "md", "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-blue")}>
                  {t.photoChange}
                  <input type="file" accept="image/*" className="sr-only" onChange={(e) => onPhoto(e.target.files?.[0])} />
                </label>
                {photoError && (
                  <div className="col-span-2">
                    <Alert tone="error">{t.photoError}</Alert>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Options: headline first (it's the biggest thing on the flyer), then details */}
          <Card className="order-2 space-y-5 p-5 sm:p-6 lg:col-start-1 lg:row-span-2 lg:row-start-1">
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
          </Card>

          {/* Sharing: the post text, then one clear set of buttons */}
          <Card className="order-3 space-y-4 p-5 sm:p-6 lg:col-start-2 lg:row-start-2">
            <h2 className="font-display text-xl font-bold text-blue">{t.shareTitle}</h2>
            <Field id="flyer-caption" label={t.caption} hint={t.captionHint}>
              <textarea id="flyer-caption" aria-describedby="flyer-caption-hint" className={inputClass()} rows={5} value={captionText} onChange={(e) => setCaption(e.target.value)} />
            </Field>
            <Button variant="primary" size="lg" className="w-full" onClick={handleLinkedIn} disabled={!assets} loading={busy}>
              <IconLinkedIn />
              {t.shareLinkedIn}
            </Button>
            <div className="grid grid-cols-2 gap-2">
              <ShareToApps
                t={t}
                native={canShareFiles}
                disabled={busy || !assets}
                onNative={handleShare}
                onApp={handleShareTo}
              />
              <Button variant="outline" size="lg" className="w-full" onClick={handleDownload} disabled={busy || !assets}>
                <IconDownload />
                {t.download}
              </Button>
            </div>
            <Button variant="ghost" className="w-full" onClick={handleCopy}>
              {t.copyCaption}
            </Button>
            {message && <Alert tone="success">{message}</Alert>}
            {backHref && (
              <p className="text-center">
                <Link href={backHref} className={linkClass}>
                  {t.backToTicket}
                </Link>
              </p>
            )}
          </Card>
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

type ShareApp = "whatsapp" | "x" | "facebook" | "email" | "instagram";
const SHARE_APPS: ShareApp[] = ["whatsapp", "instagram", "facebook", "x", "email"];

// "Share to other apps": the phone's own share sheet when it can send the
// image straight to an app; on computers, a short list of apps.
function ShareToApps({
  t,
  native,
  disabled,
  onNative,
  onApp,
}: {
  t: (typeof FLYER_COPY)[Language];
  native: boolean;
  disabled: boolean;
  onNative: () => void;
  onApp: (app: ShareApp) => void;
}) {
  const { open, setOpen, wrap, trigger } = usePopover();
  if (native) {
    return (
      <Button variant="outline" size="lg" className="w-full" onClick={onNative} disabled={disabled}>
        <IconShare />
        {t.shareOther}
      </Button>
    );
  }
  return (
    <div ref={wrap} className="relative">
      <Button
        ref={trigger}
        variant="outline"
        size="lg"
        className="w-full"
        onClick={() => setOpen((o) => !o)}
        disabled={disabled}
        aria-expanded={open}
        aria-controls="share-apps"
      >
        <IconShare />
        {t.shareOther}
      </Button>
      {open && (
        <div
          id="share-apps"
          role="dialog"
          aria-label={t.shareOther}
          className="absolute left-0 top-full z-20 mt-2 w-64 max-w-[calc(100vw-2rem)] rounded-lg border border-line bg-surface p-1.5 transition-[opacity,translate] duration-150 starting:-translate-y-1 starting:opacity-0"
        >
          {SHARE_APPS.map((app) => (
            <button
              key={app}
              type="button"
              data-autofocus={app === SHARE_APPS[0] || undefined}
              onClick={() => {
                setOpen(false);
                onApp(app);
              }}
              className="flex min-h-11 w-full items-center rounded-md px-3 text-left text-sm text-ink transition-colors duration-150 hover:bg-subtle active:bg-line"
            >
              {t.apps[app]}
            </button>
          ))}
          <p className="px-3 pb-1 pt-1.5 text-xs text-ink-3">{t.shareOtherHint}</p>
        </div>
      )}
    </div>
  );
}
