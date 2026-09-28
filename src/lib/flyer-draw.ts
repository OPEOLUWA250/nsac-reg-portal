// Draws the "I'm attending" flyer onto a <canvas>, in the browser. The
// registrant's photo is only ever drawn locally — it is never uploaded.
// The same function renders the live preview and the downloaded PNG.
//
// Layout (top to bottom): logo + "DAKAR 2027" mark, big headline, event
// name, photo in white orbit rings over a glowing planet horizon, white
// name card overlapping the photo, tagline, then a white info panel with
// the date/place and a "scan to register" QR code.

export type FlyerFormat = "portrait" | "story";

export const FLYER_SIZES: Record<FlyerFormat, { width: number; height: number }> = {
  portrait: { width: 1080, height: 1350 }, // 4:5 — LinkedIn / Instagram feed
  story: { width: 1080, height: 1920 }, // 9:16 — WhatsApp status / Instagram story
};

export interface FlyerText {
  name: string;
  /** "Job title · Organisation" line (either part may be empty). */
  subtitle: string;
  /** Big headline, e.g. "I'm attending". */
  headline: string;
  eventName: string;
  tagline: string;
  /** Top-right mark, e.g. ["DAKAR", "2027"]. */
  mark: [string, string];
  dateLabel: string;
  date: string;
  place: string;
  scanLabel: string;
  website: string;
}

/** How the photo sits in its circle. Pan is in units of the circle's radius. */
export interface PhotoFrame {
  zoom: number;
  panX: number;
  panY: number;
}

type Drawable = CanvasImageSource & { width: number; height: number };

export interface FlyerAssets {
  photo: Drawable | null;
  logo: HTMLImageElement | null;
  /** QR code (dark on white) pointing at the registration page. */
  qr: Drawable | null;
  fonts: { display: string; body: string };
}

const NAVY = "#0A1A31";
const BRAND_BLUE = "#03416A";
const GOLD = "#F09F07";
const GOLD_LIGHT = "#F7C15C";
const SKY = "#5CB8FF";

interface Layout {
  pad: number;
  logoTop: number;
  logoH: number;
  markSize: number;
  headlineY: number;
  headlineSize: number;
  headlineMin: number;
  eventY: number;
  eventSize: number;
  photoCy: number;
  photoR: number;
  horizonY: number;
  planetR: number;
  cardW: number;
  cardH: number;
  cardOverlap: number;
  nameSize: number;
  nameMin: number;
  subSize: number;
  taglineGap: number;
  taglineSize: number;
  panelTop: number;
  panelH: number;
  stripH: number;
  dateSize: number;
  qrSize: number;
}

const LAYOUTS: Record<FlyerFormat, Layout> = {
  portrait: {
    pad: 64, logoTop: 56, logoH: 84, markSize: 40,
    headlineY: 268, headlineSize: 112, headlineMin: 64,
    eventY: 326, eventSize: 30,
    photoCy: 610, photoR: 215,
    horizonY: 880, planetR: 1600,
    cardW: 780, cardH: 124, cardOverlap: 34,
    nameSize: 48, nameMin: 32, subSize: 24,
    taglineGap: 62, taglineSize: 26,
    panelTop: 1090, panelH: 232, stripH: 28,
    dateSize: 46, qrSize: 150,
  },
  story: {
    pad: 80, logoTop: 110, logoH: 118, markSize: 52,
    headlineY: 450, headlineSize: 140, headlineMin: 80,
    eventY: 530, eventSize: 38,
    photoCy: 900, photoR: 300,
    horizonY: 1250, planetR: 1500,
    cardW: 860, cardH: 164, cardOverlap: 44,
    nameSize: 64, nameMin: 40, subSize: 32,
    taglineGap: 84, taglineSize: 34,
    panelTop: 1520, panelH: 350, stripH: 50,
    dateSize: 64, qrSize: 230,
  },
};

// ---------- photo framing ----------

/** Scale (relative to the circle radius) at which the photo just covers the circle. */
function coverScale(photo: { width: number; height: number }, zoom: number) {
  return Math.max(2 / photo.width, 2 / photo.height) * zoom;
}

/** Keeps the photo covering the whole circle, whatever the pan/zoom. */
export function clampFrame(photo: { width: number; height: number } | null, frame: PhotoFrame): PhotoFrame {
  if (!photo) return frame;
  const s = coverScale(photo, frame.zoom);
  const maxX = Math.max(0, (s * photo.width - 2) / 2);
  const maxY = Math.max(0, (s * photo.height - 2) / 2);
  return {
    zoom: frame.zoom,
    panX: Math.min(maxX, Math.max(-maxX, frame.panX)),
    panY: Math.min(maxY, Math.max(-maxY, frame.panY)),
  };
}

/** Starting frame: portraits usually have the face in the top third. */
export function initialFrame(photo: { width: number; height: number }): PhotoFrame {
  return clampFrame(photo, { zoom: 1, panX: 0, panY: 0.35 });
}

/** Circle radius in canvas pixels, for converting drag distances. */
export function photoRadius(format: FlyerFormat) {
  return LAYOUTS[format].photoR;
}

// ---------- text helpers ----------

function setFont(ctx: CanvasRenderingContext2D, weight: number, size: number, family: string) {
  ctx.font = `${weight} ${size}px ${family}`;
}

function setSpacing(ctx: CanvasRenderingContext2D, px: number) {
  // letterSpacing is widely supported; older browsers just skip it.
  if ("letterSpacing" in ctx) (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${px}px`;
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width <= maxWidth || !line) line = next;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function ellipsize(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > maxWidth) t = t.slice(0, -1);
  return `${t.trimEnd()}…`;
}

/** Largest font size (from max down to min) at which the text fits on one line. */
function fitOneLine(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, size: number, min: number, weight: number, family: string) {
  for (let s = size; s > min; s -= 2) {
    setFont(ctx, weight, s, family);
    if (ctx.measureText(text).width <= maxWidth) return s;
  }
  setFont(ctx, weight, min, family);
  return min;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// Same "random" star field every time.
function stars(width: number, height: number, count: number) {
  let seed = 11;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  return Array.from({ length: count }, () => ({
    x: rand() * width,
    y: rand() * height,
    r: 0.6 + rand() * 1.9,
    a: 0.15 + rand() * 0.55,
  }));
}

// ---------- drawing ----------

export function drawFlyer(
  canvas: HTMLCanvasElement,
  format: FlyerFormat,
  text: FlyerText,
  assets: FlyerAssets,
  frame: PhotoFrame
) {
  const { width: W, height: H } = FLYER_SIZES[format];
  const L = LAYOUTS[format];
  if (canvas.width !== W) canvas.width = W;
  if (canvas.height !== H) canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const { display, body } = assets.fonts;
  const cx = W / 2;

  ctx.save();
  ctx.clearRect(0, 0, W, H);
  ctx.textBaseline = "alphabetic";

  // ---- Deep-space background ----
  const bg = ctx.createLinearGradient(0, 0, 0, L.panelTop);
  bg.addColorStop(0, "#040B1E");
  bg.addColorStop(0.55, NAVY);
  bg.addColorStop(1, "#06254A");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, L.panelTop);

  // Soft blue light from the left edge and a warm glow top right.
  const leftGlow = ctx.createRadialGradient(-W * 0.1, L.photoCy, 0, -W * 0.1, L.photoCy, W * 0.75);
  leftGlow.addColorStop(0, "rgba(40,120,220,0.55)");
  leftGlow.addColorStop(1, "rgba(40,120,220,0)");
  ctx.fillStyle = leftGlow;
  ctx.fillRect(0, 0, W, L.panelTop);
  const warm = ctx.createRadialGradient(W * 0.9, 0, 0, W * 0.9, 0, W * 0.6);
  warm.addColorStop(0, "rgba(240,159,7,0.14)");
  warm.addColorStop(1, "rgba(240,159,7,0)");
  ctx.fillStyle = warm;
  ctx.fillRect(0, 0, W, L.panelTop);

  for (const s of stars(W, L.panelTop, format === "story" ? 150 : 110)) {
    ctx.fillStyle = `rgba(255,255,255,${s.a})`;
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    ctx.fill();
  }

  // ---- Planet horizon (behind the photo) ----
  const pcy = L.horizonY + L.planetR;
  const atmosphere = ctx.createRadialGradient(cx, pcy, L.planetR * 0.97, cx, pcy, L.planetR * 1.09);
  atmosphere.addColorStop(0, "rgba(92,184,255,0)");
  atmosphere.addColorStop(0.28, "rgba(92,184,255,0.75)");
  atmosphere.addColorStop(0.45, "rgba(60,140,240,0.35)");
  atmosphere.addColorStop(1, "rgba(30,90,200,0)");
  ctx.fillStyle = atmosphere;
  ctx.fillRect(0, 0, W, L.panelTop);
  const planet = ctx.createLinearGradient(0, L.horizonY, 0, L.panelTop);
  planet.addColorStop(0, "#0B2C57");
  planet.addColorStop(0.25, "#061A36");
  planet.addColorStop(1, "#030C1C");
  ctx.fillStyle = planet;
  ctx.beginPath();
  ctx.arc(cx, pcy, L.planetR, 0, Math.PI * 2);
  ctx.fill();
  // Bright rim + sunrise flare at the top of the curve.
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, pcy, L.planetR, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(170,220,255,0.9)";
  ctx.lineWidth = 3;
  ctx.shadowColor = SKY;
  ctx.shadowBlur = 30;
  ctx.stroke();
  ctx.restore();
  const flare = ctx.createRadialGradient(cx, L.horizonY, 0, cx, L.horizonY, W * 0.45);
  flare.addColorStop(0, "rgba(210,240,255,0.8)");
  flare.addColorStop(0.35, "rgba(92,184,255,0.28)");
  flare.addColorStop(1, "rgba(92,184,255,0)");
  ctx.fillStyle = flare;
  ctx.fillRect(0, L.horizonY - W * 0.45, W, W * 0.9);

  // Diagonal light beam, bottom right.
  const beam = ctx.createLinearGradient(W, L.panelTop, W * 0.6, L.photoCy);
  beam.addColorStop(0, "rgba(3,65,106,0.95)");
  beam.addColorStop(1, "rgba(28,110,200,0)");
  ctx.fillStyle = beam;
  ctx.beginPath();
  ctx.moveTo(W, L.photoCy - L.photoR * 0.3);
  ctx.lineTo(W, L.panelTop);
  ctx.lineTo(W - L.photoR * 1.25, L.panelTop);
  ctx.closePath();
  ctx.fill();

  // ---- Top row: logo (left) and "DAKAR / 2027" mark (right) ----
  if (assets.logo && assets.logo.naturalWidth) {
    const h = L.logoH;
    const w = (assets.logo.naturalWidth / assets.logo.naturalHeight) * h;
    ctx.drawImage(assets.logo, L.pad, L.logoTop, w, h);
  } else {
    setFont(ctx, 700, L.logoH * 0.4, display);
    ctx.fillStyle = "#FFFFFF";
    ctx.textAlign = "left";
    ctx.fillText("NewSpace Africa", L.pad, L.logoTop + L.logoH * 0.62);
  }
  ctx.textAlign = "right";
  setFont(ctx, 700, L.markSize, display);
  setSpacing(ctx, L.markSize * 0.06);
  ctx.fillStyle = "#FFFFFF";
  ctx.fillText(text.mark[0], W - L.pad, L.logoTop + L.markSize * 0.95);
  ctx.fillStyle = GOLD_LIGHT;
  ctx.fillText(text.mark[1], W - L.pad, L.logoTop + L.markSize * 1.95);
  setSpacing(ctx, 0);

  // ---- Headline + event name ----
  ctx.textAlign = "center";
  const headSize = fitOneLine(ctx, text.headline, W - L.pad * 2, L.headlineSize, L.headlineMin, 700, display);
  setSpacing(ctx, -headSize * 0.025);
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.35)";
  ctx.shadowBlur = 24;
  ctx.fillStyle = "#FFFFFF";
  ctx.fillText(text.headline, cx, L.headlineY);
  ctx.restore();
  setSpacing(ctx, 0);

  // Event name: letter-spaced capitals, shrunk (not cut) to fit the width.
  const eventUpper = text.eventName.toUpperCase();
  let eventSize = L.eventSize;
  for (; eventSize > L.eventSize * 0.6; eventSize -= 1) {
    setFont(ctx, 600, eventSize, body);
    setSpacing(ctx, eventSize * 0.2);
    if (ctx.measureText(eventUpper).width <= W - L.pad * 2) break;
  }
  setFont(ctx, 600, eventSize, body);
  setSpacing(ctx, eventSize * 0.2);
  ctx.fillStyle = GOLD_LIGHT;
  ctx.fillText(ellipsize(ctx, eventUpper, W - L.pad * 2), cx + eventSize * 0.1, L.eventY);
  setSpacing(ctx, 0);

  // ---- Photo with white orbit rings ----
  const r = L.photoR;
  const cy = L.photoCy;
  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(255,255,255,0.28)";
  ctx.beginPath();
  ctx.arc(cx, cy, r + r * 0.2, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = "rgba(255,255,255,0.12)";
  ctx.beginPath();
  ctx.arc(cx, cy, r + r * 0.34, 0, Math.PI * 2);
  ctx.stroke();
  const orbitDot = (angle: number, radius: number, size: number, color: string) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius, size, 0, Math.PI * 2);
    ctx.fill();
  };
  orbitDot(-Math.PI * 0.22, r * 1.2, r * 0.045, GOLD);
  orbitDot(Math.PI * 0.9, r * 1.34, r * 0.028, "rgba(255,255,255,0.8)");

  // White frame + photo.
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.45)";
  ctx.shadowBlur = 40;
  ctx.fillStyle = "#FFFFFF";
  ctx.beginPath();
  ctx.arc(cx, cy, r + r * 0.05, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();
  if (assets.photo) {
    const f = clampFrame(assets.photo, frame);
    const s = coverScale(assets.photo, f.zoom) * r;
    const w = assets.photo.width * s;
    const h = assets.photo.height * s;
    ctx.drawImage(assets.photo, cx - w / 2 + f.panX * r, cy - h / 2 + f.panY * r, w, h);
  } else {
    const ph = ctx.createLinearGradient(0, cy - r, 0, cy + r);
    ph.addColorStop(0, "#1C4F82");
    ph.addColorStop(1, "#0A2A4E");
    ctx.fillStyle = ph;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    // Simple person silhouette.
    ctx.fillStyle = "rgba(255,255,255,0.22)";
    ctx.beginPath();
    ctx.arc(cx, cy - r * 0.18, r * 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(cx, cy + r * 0.72, r * 0.62, r * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // ---- Name card, overlapping the bottom of the photo ----
  const cardX = cx - L.cardW / 2;
  const cardY = cy + r - L.cardOverlap;
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.35)";
  ctx.shadowBlur = 36;
  ctx.shadowOffsetY = 10;
  ctx.fillStyle = "#FFFFFF";
  roundRect(ctx, cardX, cardY, L.cardW, L.cardH, L.cardH * 0.22);
  ctx.fill();
  ctx.restore();
  // Gold accent on the card's left edge.
  ctx.save();
  roundRect(ctx, cardX, cardY, L.cardW, L.cardH, L.cardH * 0.22);
  ctx.clip();
  ctx.fillStyle = GOLD;
  ctx.fillRect(cardX, cardY, L.cardH * 0.07, L.cardH);
  ctx.restore();

  const inner = L.cardW - L.cardH * 0.7;
  const hasSub = Boolean(text.subtitle.trim());
  const nameSize = fitOneLine(ctx, text.name || " ", inner, L.nameSize, L.nameMin, 700, display);
  const nameY = hasSub ? cardY + L.cardH * 0.5 : cardY + L.cardH * 0.5 + nameSize * 0.35;
  ctx.fillStyle = NAVY;
  ctx.textAlign = "center";
  ctx.fillText(ellipsize(ctx, text.name || " ", inner), cx, nameY);
  if (hasSub) {
    setFont(ctx, 500, L.subSize, body);
    ctx.fillStyle = "rgba(10,26,49,0.62)";
    ctx.fillText(ellipsize(ctx, text.subtitle, inner), cx, cardY + L.cardH * 0.8);
  }

  // ---- Tagline ----
  setFont(ctx, 500, L.taglineSize, body);
  ctx.fillStyle = "rgba(255,255,255,0.88)";
  // Kept narrower than the page so it stays clear of the planet's rim, and
  // balanced so the second line isn't a lone word.
  const tagMax = W - L.pad * 3.4;
  let tagLines = wrap(ctx, text.tagline, tagMax);
  if (tagLines.length === 2) {
    for (let w = tagMax; w > tagMax * 0.5; w -= 10) {
      const tryLines = wrap(ctx, text.tagline, w);
      if (tryLines.length > 2) break;
      tagLines = tryLines;
    }
  }
  tagLines = tagLines.slice(0, 2);
  const tagTop = cardY + L.cardH + L.taglineGap;
  tagLines.forEach((line, i) => ctx.fillText(line, cx, tagTop + i * L.taglineSize * 1.4));

  // ---- White info panel ----
  const pTop = L.panelTop;
  const pH = L.panelH;
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, pTop, W, pH);
  // Divider.
  ctx.fillStyle = "rgba(10,26,49,0.85)";
  ctx.fillRect(cx - 1.5, pTop + pH * 0.16, 3, pH * 0.68);

  // Left: calendar icon, date and place.
  const colL = W * 0.25;
  const iconS = L.dateSize * 0.9;
  const dateY = pTop + pH * 0.54;
  setFont(ctx, 600, L.dateSize * 0.42, body);
  setSpacing(ctx, L.dateSize * 0.04);
  ctx.fillStyle = BRAND_BLUE;
  ctx.textAlign = "left";
  const labelW = ctx.measureText(text.dateLabel.toUpperCase()).width;
  setSpacing(ctx, 0);
  setFont(ctx, 700, L.dateSize, display);
  const dateW = ctx.measureText(text.date).width;
  setFont(ctx, 500, L.dateSize * 0.5, body);
  const placeW = ctx.measureText(text.place).width;
  const blockW = iconS + L.dateSize * 0.35 + Math.max(dateW, labelW, placeW);
  const blockX = Math.max(L.pad * 0.6, colL - blockW / 2);
  const textX = blockX + iconS + L.dateSize * 0.35;

  // Calendar icon.
  const iy = dateY - iconS * 0.82;
  ctx.fillStyle = BRAND_BLUE;
  roundRect(ctx, blockX, iy, iconS, iconS, iconS * 0.18);
  ctx.fill();
  ctx.fillStyle = "#FFFFFF";
  roundRect(ctx, blockX + iconS * 0.12, iy + iconS * 0.34, iconS * 0.76, iconS * 0.54, iconS * 0.08);
  ctx.fill();
  ctx.fillStyle = GOLD;
  for (let i = 0; i < 3; i++) ctx.fillRect(blockX + iconS * (0.22 + i * 0.2), iy + iconS * 0.46, iconS * 0.12, iconS * 0.12);
  ctx.fillStyle = BRAND_BLUE;
  ctx.fillRect(blockX + iconS * 0.24, iy - iconS * 0.1, iconS * 0.1, iconS * 0.24);
  ctx.fillRect(blockX + iconS * 0.66, iy - iconS * 0.1, iconS * 0.1, iconS * 0.24);

  setFont(ctx, 600, L.dateSize * 0.42, body);
  setSpacing(ctx, L.dateSize * 0.04);
  ctx.fillStyle = BRAND_BLUE;
  ctx.fillText(text.dateLabel.toUpperCase(), textX, dateY - L.dateSize * 0.95);
  setSpacing(ctx, 0);
  setFont(ctx, 700, L.dateSize, display);
  ctx.fillStyle = NAVY;
  ctx.fillText(text.date, textX, dateY);
  setFont(ctx, 500, L.dateSize * 0.5, body);
  ctx.fillStyle = "rgba(10,26,49,0.7)";
  ctx.fillText(text.place, textX, dateY + L.dateSize * 0.72);

  // Right: "Scan to register" + QR code.
  const qs = L.qrSize;
  const colR = W * 0.75;
  setFont(ctx, 700, L.dateSize * 0.5, display);
  const scanLines = wrap(ctx, text.scanLabel, W * 0.15);
  const scanW = Math.max(...scanLines.map((l) => ctx.measureText(l).width));
  const gap = L.dateSize * 0.4;
  const groupW = scanW + gap + qs;
  const gx = colR - groupW / 2;
  const qy = pTop + (pH - qs) / 2;
  ctx.fillStyle = NAVY;
  ctx.textAlign = "left";
  const lh = L.dateSize * 0.6;
  const scanTop = pTop + pH / 2 - (scanLines.length * lh) / 2 + lh * 0.78;
  scanLines.forEach((line, i) => ctx.fillText(line, gx, scanTop + i * lh));
  if (assets.qr) {
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(assets.qr, gx + scanW + gap, qy, qs, qs);
    ctx.imageSmoothingEnabled = true;
  }

  // ---- Bottom strip: blue with gold edge, website ----
  const sTop = pTop + pH;
  const strip = ctx.createLinearGradient(0, 0, W, 0);
  strip.addColorStop(0, BRAND_BLUE);
  strip.addColorStop(1, NAVY);
  ctx.fillStyle = strip;
  ctx.fillRect(0, sTop, W, H - sTop);
  const edge = ctx.createLinearGradient(0, 0, W, 0);
  edge.addColorStop(0, GOLD);
  edge.addColorStop(1, GOLD_LIGHT);
  ctx.fillStyle = edge;
  ctx.fillRect(0, sTop, W, Math.max(4, L.stripH * 0.14));
  if (H - sTop > 30) {
    setFont(ctx, 600, Math.min(L.stripH * 0.5, 24), body);
    setSpacing(ctx, 2);
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.textAlign = "center";
    ctx.fillText(text.website.toUpperCase(), cx, sTop + (H - sTop) * 0.66);
    setSpacing(ctx, 0);
  }

  ctx.restore();
}
