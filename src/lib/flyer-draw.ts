// Draws the "I'm attending" flyer onto a <canvas>, in the browser. The
// registrant's photo is only ever drawn locally — it is never uploaded.
// The same function renders the live preview and the downloaded PNG.

export type FlyerFormat = "square" | "story";

export const FLYER_SIZES: Record<FlyerFormat, { width: number; height: number }> = {
  square: { width: 1080, height: 1080 }, // LinkedIn / Instagram post
  story: { width: 1080, height: 1920 }, // WhatsApp status / Instagram story
};

export interface FlyerText {
  name: string;
  /** "Job title · Organisation" line (either part may be empty). */
  subtitle: string;
  /** e.g. "I'm attending" — drawn in capitals. */
  headline: string;
  eventName: string;
  /** e.g. "April 2027 · Dakar, Senegal" */
  dateLine: string;
  website: string;
}

/** How the photo sits in its circle. Pan is in units of the circle's radius. */
export interface PhotoFrame {
  zoom: number;
  panX: number;
  panY: number;
}

export interface FlyerAssets {
  photo: CanvasImageSource & { width: number; height: number } | null;
  logo: HTMLImageElement | null;
  fonts: { display: string; body: string };
}

const NAVY = "#0A1A31";
const BRAND_BLUE = "#03416A";
const GOLD = "#F09F07";
const GOLD_LIGHT = "#F7C15C";

interface Layout {
  pad: number;
  logoTop: number;
  logoH: number;
  photoCy: number;
  photoR: number;
  /** Orbit ring radii, as multiples of the photo radius. */
  orbits: [number, number];
  nameGap: number;
  nameSize: number;
  nameMin: number;
  subSize: number;
  subLine: number;
  kickerGap: number;
  kickerSize: number;
  titleGap: number;
  titleSize: number;
  titleMin: number;
  titleLines: number;
  bandH: number;
  bandSize: number;
}

const LAYOUTS: Record<FlyerFormat, Layout> = {
  square: {
    pad: 72, logoTop: 60, logoH: 88,
    photoCy: 380, photoR: 180, orbits: [1.42, 1.72],
    nameGap: 96, nameSize: 60, nameMin: 38,
    subSize: 28, subLine: 38,
    kickerGap: 66, kickerSize: 26,
    titleGap: 60, titleSize: 50, titleMin: 34, titleLines: 2,
    bandH: 112, bandSize: 26,
  },
  story: {
    pad: 90, logoTop: 120, logoH: 124,
    photoCy: 720, photoR: 290, orbits: [1.26, 1.48],
    nameGap: 196, nameSize: 84, nameMin: 50,
    subSize: 38, subLine: 52,
    kickerGap: 112, kickerSize: 34,
    titleGap: 86, titleSize: 70, titleMin: 46, titleLines: 2,
    bandH: 230, bandSize: 34,
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

/** Largest font size (from max down to min) at which the text fits in maxLines. */
function fit(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  { size, min, weight, family, maxLines }: { size: number; min: number; weight: number; family: string; maxLines: number }
): { size: number; lines: string[] } {
  for (let s = size; s >= min; s -= 2) {
    setFont(ctx, weight, s, family);
    const lines = wrap(ctx, text, maxWidth);
    if (lines.length <= maxLines && lines.every((l) => ctx.measureText(l).width <= maxWidth)) {
      return { size: s, lines };
    }
  }
  setFont(ctx, weight, min, family);
  const lines = wrap(ctx, text, maxWidth).slice(0, maxLines);
  lines[lines.length - 1] = ellipsize(ctx, lines[lines.length - 1], maxWidth);
  return { size: min, lines };
}

// Same "random" star field every time.
function stars(width: number, height: number, count: number) {
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  return Array.from({ length: count }, () => ({
    x: rand() * width,
    y: rand() * height,
    r: 0.8 + rand() * 1.8,
    a: 0.12 + rand() * 0.4,
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
  const contentW = W - L.pad * 2;

  ctx.save();
  ctx.clearRect(0, 0, W, H);
  ctx.textBaseline = "alphabetic";

  // Background: navy → conference blue, with a warm glow and stars.
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, NAVY);
  bg.addColorStop(1, BRAND_BLUE);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  const glow = ctx.createRadialGradient(W * 0.85, H * 0.1, 0, W * 0.85, H * 0.1, W * 0.75);
  glow.addColorStop(0, "rgba(240,159,7,0.16)");
  glow.addColorStop(1, "rgba(240,159,7,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  for (const s of stars(W, H, format === "story" ? 90 : 60)) {
    ctx.fillStyle = `rgba(255,255,255,${s.a})`;
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Orbits around the photo.
  const r = L.photoR;
  const cy = L.photoCy;
  ctx.lineWidth = 3;
  ctx.strokeStyle = "rgba(247,193,92,0.35)";
  ctx.beginPath();
  ctx.ellipse(cx, cy, r * L.orbits[0], r * L.orbits[0], 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(255,255,255,0.12)";
  ctx.beginPath();
  ctx.ellipse(cx, cy, r * L.orbits[1], r * L.orbits[1], 0, 0, Math.PI * 2);
  ctx.stroke();
  const dot = (angle: number, radius: number, size: number, color: string) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius, size, 0, Math.PI * 2);
    ctx.fill();
  };
  dot(-Math.PI / 5, r * L.orbits[0], r * 0.06, GOLD);
  dot(Math.PI * 0.82, r * L.orbits[1], r * 0.035, "rgba(255,255,255,0.7)");

  // Logo (white), top left.
  if (assets.logo && assets.logo.naturalWidth) {
    const h = L.logoH;
    const w = (assets.logo.naturalWidth / assets.logo.naturalHeight) * h;
    ctx.drawImage(assets.logo, L.pad, L.logoTop, w, h);
  } else {
    ctx.fillStyle = GOLD;
    ctx.beginPath();
    ctx.arc(L.pad + 10, L.logoTop + L.logoH / 2, 10, 0, Math.PI * 2);
    ctx.fill();
    setFont(ctx, 700, L.logoH * 0.42, display);
    ctx.fillStyle = "#FFFFFF";
    ctx.textAlign = "left";
    ctx.fillText("NewSpace Africa", L.pad + 32, L.logoTop + L.logoH / 2 + L.logoH * 0.15);
  }

  // Photo in a circle, with a gold ring.
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  if (assets.photo) {
    const f = clampFrame(assets.photo, frame);
    const s = coverScale(assets.photo, f.zoom) * r;
    const w = assets.photo.width * s;
    const h = assets.photo.height * s;
    ctx.drawImage(assets.photo, cx - w / 2 + f.panX * r, cy - h / 2 + f.panY * r, w, h);
  } else {
    ctx.fillStyle = "rgba(255,255,255,0.08)";
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    const initials = text.name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase())
      .join("");
    setFont(ctx, 700, r * 0.62, display);
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.textAlign = "center";
    ctx.fillText(initials || "+", cx, cy + r * 0.22);
  }
  ctx.restore();
  const ring = Math.max(8, r * 0.055);
  ctx.lineWidth = ring;
  ctx.strokeStyle = GOLD;
  ctx.beginPath();
  ctx.arc(cx, cy, r + ring / 2, 0, Math.PI * 2);
  ctx.stroke();

  // Name.
  ctx.textAlign = "center";
  let y = cy + r + ring + L.nameGap;
  const name = fit(ctx, text.name || " ", contentW, {
    size: L.nameSize, min: L.nameMin, weight: 700, family: display, maxLines: 2,
  });
  setFont(ctx, 700, name.size, display);
  ctx.fillStyle = "#FFFFFF";
  name.lines.forEach((line, i) => ctx.fillText(line, cx, y + i * name.size * 1.1));
  y += (name.lines.length - 1) * name.size * 1.1;

  // Job title · organisation.
  if (text.subtitle.trim()) {
    setFont(ctx, 500, L.subSize, body);
    let lines = wrap(ctx, text.subtitle, contentW);
    if (lines.length > 2) lines = [lines[0], ellipsize(ctx, lines.slice(1).join(" "), contentW)];
    ctx.fillStyle = "rgba(255,255,255,0.74)";
    lines.forEach((line, i) => ctx.fillText(line, cx, y + L.subLine * (i + 1.25)));
    y += L.subLine * (lines.length + 0.25);
  }

  // Headline ("I'M ATTENDING") between two gold rules.
  y += L.kickerGap;
  setFont(ctx, 700, L.kickerSize, body);
  setSpacing(ctx, L.kickerSize * 0.22);
  const kicker = text.headline.toUpperCase();
  const kw = ctx.measureText(kicker).width;
  ctx.fillStyle = GOLD_LIGHT;
  ctx.fillText(kicker, cx + L.kickerSize * 0.11, y);
  setSpacing(ctx, 0);
  const ruleY = y - L.kickerSize * 0.36;
  const ruleW = L.kickerSize * 2.2;
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(cx - kw / 2 - 24 - ruleW, ruleY);
  ctx.lineTo(cx - kw / 2 - 24, ruleY);
  ctx.moveTo(cx + kw / 2 + 24, ruleY);
  ctx.lineTo(cx + kw / 2 + 24 + ruleW, ruleY);
  ctx.stroke();

  // Event name.
  y += L.titleGap;
  const title = fit(ctx, text.eventName, contentW, {
    size: L.titleSize, min: L.titleMin, weight: 700, family: display, maxLines: L.titleLines,
  });
  setFont(ctx, 700, title.size, display);
  ctx.fillStyle = "#FFFFFF";
  title.lines.forEach((line, i) => ctx.fillText(line, cx, y + i * title.size * 1.12));

  // Bottom band: date · place and website.
  const bandTop = H - L.bandH;
  ctx.fillStyle = "rgba(5,13,26,0.45)";
  ctx.fillRect(0, bandTop, W, L.bandH);
  const bar = ctx.createLinearGradient(0, 0, W, 0);
  bar.addColorStop(0, GOLD);
  bar.addColorStop(1, GOLD_LIGHT);
  ctx.fillStyle = bar;
  ctx.fillRect(0, bandTop, W, 6);

  if (format === "square") {
    const mid = bandTop + L.bandH / 2 + L.bandSize * 0.36;
    setFont(ctx, 600, L.bandSize, body);
    ctx.fillStyle = "#FFFFFF";
    ctx.textAlign = "left";
    ctx.fillText(ellipsize(ctx, text.dateLine, W / 2 - L.pad), L.pad, mid);
    setFont(ctx, 500, L.bandSize, body);
    ctx.fillStyle = GOLD_LIGHT;
    ctx.textAlign = "right";
    ctx.fillText(text.website, W - L.pad, mid);
  } else {
    setFont(ctx, 600, L.bandSize * 1.1, body);
    ctx.fillStyle = "#FFFFFF";
    ctx.textAlign = "center";
    ctx.fillText(text.dateLine, cx, bandTop + L.bandH * 0.44);
    setFont(ctx, 500, L.bandSize, body);
    ctx.fillStyle = GOLD_LIGHT;
    ctx.fillText(text.website, cx, bandTop + L.bandH * 0.74);
  }

  ctx.restore();
}
