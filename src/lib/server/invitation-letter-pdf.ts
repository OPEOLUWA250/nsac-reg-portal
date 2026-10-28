import "server-only";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { LetterContent } from "@/lib/invitation-letter";
import { brandLogoPng } from "@/lib/ticket-image";
import { describeError } from "@/lib/describe-error";

// The invitation letter on A4: the conference letterhead (blue band with the
// white logo, gold rule), the letter, a table of the attendee's details and a
// space to sign. Drawn once for the PDF that is emailed and once as pictures
// for the preview, so the admin sees exactly what is sent. Text in the PDF is
// real text (selectable, searchable), in the site's own fonts.

const W = 595.28; // A4, in points
const H = 841.89;
const M = 56; // side margins
const BAND = 84;
const BOTTOM = H - 52; // last line of text, just above the footer rule (H - 44)

const BLUE = "#03416A";
const GOLD = "#F09F07";
const INK = "#232323";
const INK_2 = "#454B52";
const INK_3 = "#5E6670";
const LINE = "#E1DED7";

const SANS = "'NSAC Sans', 'Helvetica Neue', Arial, sans-serif";
const DISPLAY = "'NSAC Display', 'Helvetica Neue', Arial, sans-serif";
const BODY = 10.5;
const LEADING = 14.5;

type Canvas = typeof import("@napi-rs/canvas");
// A PDF page and a picture canvas take the same drawing calls.
type Ctx = import("@napi-rs/canvas").SKRSContext2D;
type Img = Awaited<ReturnType<Canvas["loadImage"]>>;

let setup: Promise<{ canvas: Canvas; logo: Img | null }> | null = null;

// The site's fonts (src/app/fonts, packaged with this route: next.config.ts)
// and the logo, loaded once per server.
function assets() {
  setup ??= (async () => {
    const canvas = await import("@napi-rs/canvas");
    const dir = join(process.cwd(), "src", "app", "fonts");
    for (const [file, name] of [["dm-sans.woff2", "NSAC Sans"], ["nsac-display.woff2", "NSAC Display"]]) {
      if (canvas.GlobalFonts.has(name)) continue;
      try {
        canvas.GlobalFonts.register(await readFile(join(dir, file)), name);
      } catch (err) {
        console.warn(`Letter font ${file} unavailable, using a fallback: ${describeError(err)}`);
      }
    }
    const png = await brandLogoPng();
    const logo = png ? await canvas.loadImage(png).catch(() => null) : null;
    return { canvas, logo };
  })();
  return setup;
}

function wrap(ctx: Ctx, text: string, width: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(next).width > width) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

/** Lays the letter out, asking for a new page when one is full. */
function draw(content: LetterContent, logo: Img | null, newPage: () => Ctx) {
  let ctx = newPage();
  let y = 0;

  const letterhead = () => {
    ctx.fillStyle = BLUE;
    ctx.fillRect(0, 0, W, BAND);
    ctx.fillStyle = GOLD;
    ctx.fillRect(0, BAND, W, 3);
    if (logo) {
      const h = 46;
      ctx.drawImage(logo, M, (BAND - h) / 2, (logo.width / logo.height) * h, h);
    } else {
      ctx.fillStyle = "#ffffff";
      ctx.font = `800 18px ${DISPLAY}`;
      ctx.fillText("NewSpace Africa Conference", M, BAND / 2 + 6);
    }
    // Dates and place on the right, as in the emails.
    const [name, dates, place] = content.footer.split(" · ");
    ctx.textAlign = "right";
    ctx.fillStyle = "#ffffff";
    ctx.font = `700 8.5px ${SANS}`;
    ctx.fillText(name.toUpperCase(), W - M, BAND / 2 - 8);
    ctx.fillText(dates.toUpperCase(), W - M, BAND / 2 + 5);
    ctx.fillStyle = "#B9CCDA";
    ctx.fillText(place.toUpperCase(), W - M, BAND / 2 + 18);
    ctx.textAlign = "left";
    // Footer
    ctx.strokeStyle = LINE;
    ctx.lineWidth = 0.75;
    ctx.beginPath();
    ctx.moveTo(M, H - 44);
    ctx.lineTo(W - M, H - 44);
    ctx.stroke();
    ctx.fillStyle = INK_3;
    ctx.font = `400 8px ${SANS}`;
    ctx.textAlign = "center";
    ctx.fillText(content.footer, W / 2, H - 30);
    ctx.textAlign = "left";
    y = BAND + 36;
  };

  // Room for `need` points, or onto a new page.
  const room = (need: number) => {
    if (y + need <= BOTTOM) return;
    ctx = newPage();
    letterhead();
  };

  const paragraph = (text: string, { font = `400 ${BODY}px ${SANS}`, color = INK_2, after = 8 } = {}) => {
    ctx.font = font;
    ctx.fillStyle = color;
    for (const line of wrap(ctx, text, W - 2 * M)) {
      room(LEADING);
      ctx.fillText(line, M, y);
      y += LEADING;
    }
    y += after;
  };

  letterhead();

  // Reference and date
  ctx.font = `400 ${BODY}px ${SANS}`;
  ctx.fillStyle = INK_3;
  ctx.fillText(content.reference, M, y);
  ctx.textAlign = "right";
  ctx.fillText(content.date, W - M, y);
  ctx.textAlign = "left";
  y += LEADING * 1.7;

  for (const line of content.recipient) paragraph(line, { font: `700 ${BODY}px ${SANS}`, color: INK, after: 0 });
  y += LEADING;

  paragraph(content.subject, { font: `800 12.5px ${DISPLAY}`, color: BLUE, after: 14 });
  paragraph(content.salutation, { color: INK });
  paragraph(content.intro);

  // The person invited: labels on the left, values in bold, between hairlines.
  const labelW = 150;
  const rowPad = 4.5;
  ctx.strokeStyle = LINE;
  ctx.lineWidth = 0.75;
  const rule = () => {
    ctx.beginPath();
    ctx.moveTo(M, y);
    ctx.lineTo(W - M, y);
    ctx.stroke();
  };
  room(LEADING + rowPad * 2);
  y += 2;
  rule();
  for (const [label, value] of content.details) {
    ctx.font = `700 ${BODY}px ${SANS}`;
    const lines = wrap(ctx, value, W - 2 * M - labelW);
    const h = lines.length * LEADING + rowPad * 2;
    room(h);
    ctx.font = `400 9.5px ${SANS}`;
    ctx.fillStyle = INK_3;
    ctx.fillText(label, M, y + rowPad + 11);
    ctx.font = `700 ${BODY}px ${SANS}`;
    ctx.fillStyle = INK;
    lines.forEach((line, i) => ctx.fillText(line, M + labelW, y + rowPad + 11 + i * LEADING));
    y += h;
    rule();
  }
  y += 18;

  for (const p of content.paragraphs) paragraph(p);

  // Sign-off, kept together, with room for a signature or stamp.
  ctx.font = `400 ${BODY}px ${SANS}`;
  const closingLines = wrap(ctx, content.closing, W - 2 * M).length;
  const signatureLines = 2 + (content.signatoryTitle ? 1 : 0) + wrap(ctx, content.onBehalf, W - 2 * M).length - 1;
  room((closingLines + signatureLines) * LEADING + 32);
  paragraph(content.closing, { color: INK, after: 32 });
  ctx.strokeStyle = INK_3;
  ctx.beginPath();
  ctx.moveTo(M, y - 14);
  ctx.lineTo(M + 170, y - 14);
  ctx.stroke();
  paragraph(content.signatoryName, { font: `700 ${BODY}px ${SANS}`, color: INK, after: 0 });
  if (content.signatoryTitle) paragraph(content.signatoryTitle, { after: 0 });
  paragraph(content.onBehalf, { color: INK_3, after: 0 });
}

/** The letter as a PDF, to attach to the email. */
export async function renderLetterPdf(content: LetterContent): Promise<Buffer> {
  const { canvas, logo } = await assets();
  const doc = new canvas.PDFDocument({ title: content.subject, author: "NewSpace Africa Conference", creator: "NewSpace Africa Conference registration" });
  let open = false;
  draw(content, logo, () => {
    if (open) doc.endPage();
    open = true;
    return doc.beginPage(W, H) as unknown as Ctx;
  });
  if (open) doc.endPage();
  return doc.close();
}

/** The same letter as JPEG pages, for the preview in the dashboard. */
export async function renderLetterPages(content: LetterContent, scale = 1.6): Promise<Buffer[]> {
  const { canvas, logo } = await assets();
  const pages: InstanceType<Canvas["Canvas"]>[] = [];
  draw(content, logo, () => {
    const c = canvas.createCanvas(Math.round(W * scale), Math.round(H * scale));
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.scale(scale, scale);
    pages.push(c);
    return ctx;
  });
  return Promise.all(pages.map((c) => c.encode("jpeg", 82)));
}
