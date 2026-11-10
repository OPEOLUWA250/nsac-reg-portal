import "server-only";
import type { ReceiptContent } from "@/lib/receipt";
import { pdfAssets, PDF_DISPLAY as DISPLAY, PDF_SANS as SANS, wrapText as wrap, type Ctx, type Img } from "@/lib/server/pdf-assets";

// The payment receipt on one A4 page, in the invitation letter's letterhead:
// blue band with the white logo and a gold rule, the title with a PAID mark,
// who paid and who received it, the ticket and amount, the payment details
// (Stripe payment ID) and a footer. Real, selectable text in the site's fonts.

const W = 595.28; // A4, in points
const H = 841.89;
const M = 56;
const BAND = 84;

const BLUE = "#03416A";
const GOLD = "#F09F07";
const GOLD_INK = "#8A5300";
const GREEN = "#1F7A4D";
const INK = "#232323";
const INK_2 = "#454B52";
const INK_3 = "#5E6670";
const LINE = "#E1DED7";
const PANEL = "#FAF8F4";

function draw(ctx: Ctx, c: ReceiptContent, logo: Img | null) {
  const hairline = (y: number, color = LINE, width = 0.75) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(M, y);
    ctx.lineTo(W - M, y);
    ctx.stroke();
  };
  const text = (s: string, x: number, y: number, font: string, color: string, align: CanvasTextAlign = "left") => {
    ctx.font = font;
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.fillText(s, x, y);
    ctx.textAlign = "left";
  };

  // Letterhead
  ctx.fillStyle = BLUE;
  ctx.fillRect(0, 0, W, BAND);
  ctx.fillStyle = GOLD;
  ctx.fillRect(0, BAND, W, 3);
  if (logo) {
    const h = 46;
    ctx.drawImage(logo, M, (BAND - h) / 2, (logo.width / logo.height) * h, h);
  } else {
    text("NewSpace Africa Conference", M, BAND / 2 + 6, `800 18px ${DISPLAY}`, "#ffffff");
  }
  const [name, dates, place] = c.footer.split(" · ");
  text(name.toUpperCase(), W - M, BAND / 2 - 8, `700 8.5px ${SANS}`, "#ffffff", "right");
  text(dates.toUpperCase(), W - M, BAND / 2 + 5, `700 8.5px ${SANS}`, "#ffffff", "right");
  text(place.toUpperCase(), W - M, BAND / 2 + 18, `700 8.5px ${SANS}`, "#B9CCDA", "right");

  // Title and PAID mark
  let y = BAND + 52;
  text(c.title, M, y, `800 24px ${DISPLAY}`, BLUE);
  ctx.font = `700 11px ${SANS}`;
  const stampW = ctx.measureText(c.paid).width + 28;
  ctx.strokeStyle = GREEN;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(W - M - stampW, y - 19, stampW, 26, 4);
  ctx.stroke();
  text(c.paid, W - M - stampW / 2, y - 2, `700 11px ${SANS}`, GREEN, "center");

  // Receipt number and date
  y += 28;
  for (const [label, value] of c.meta) {
    text(label, M, y, `400 9.5px ${SANS}`, INK_3);
    text(value, M + 90, y, `700 10.5px ${SANS}`, INK);
    y += 16;
  }

  // Received from | Issued by
  y += 18;
  const colW = (W - 2 * M - 24) / 2;
  const column = (x: number, title: string, lines: string[]) => {
    let cy = y;
    text(title.toUpperCase(), x, cy, `700 8.5px ${SANS}`, GOLD_INK);
    cy += 17;
    lines.forEach((line, i) => {
      const font = i === 0 ? `700 11px ${SANS}` : `400 10px ${SANS}`;
      ctx.font = font;
      for (const part of wrap(ctx, line, colW)) {
        text(part, x, cy, font, i === 0 ? INK : INK_2);
        cy += i === 0 ? 15 : 14;
      }
    });
    return cy;
  };
  y = Math.max(column(M, c.fromTitle, c.from), column(M + colW + 24, c.issuerTitle, c.issuer)) + 16;

  // What was paid for
  const amountX = W - M - 12;
  const descW = W - 2 * M - 24 - 130;
  ctx.fillStyle = PANEL;
  ctx.fillRect(M, y, W - 2 * M, 26);
  hairline(y);
  text(c.columns[0].toUpperCase(), M + 12, y + 17, `700 8.5px ${SANS}`, INK_3);
  text(c.columns[1].toUpperCase(), amountX, y + 17, `700 8.5px ${SANS}`, INK_3, "right");
  y += 26;
  hairline(y);
  y += 20;
  ctx.font = `700 11px ${SANS}`;
  const descLines = wrap(ctx, c.item.description, descW);
  text(c.item.amount, amountX, y, `700 11px ${SANS}`, INK, "right");
  for (const line of descLines) {
    text(line, M + 12, y, `700 11px ${SANS}`, INK);
    y += 15;
  }
  for (const detail of c.item.details) {
    ctx.font = `400 9.5px ${SANS}`;
    for (const line of wrap(ctx, detail, descW)) {
      text(line, M + 12, y, `400 9.5px ${SANS}`, INK_3);
      y += 13.5;
    }
  }
  y += 8;
  hairline(y, BLUE, 1.5);
  y += 26;
  text(c.totalLabel, M + 12, y, `700 12px ${SANS}`, INK);
  text(c.total, amountX, y + 1, `800 17px ${DISPLAY}`, BLUE, "right");
  y += 16;
  hairline(y);

  // Payment details
  y += 34;
  text(c.paymentTitle.toUpperCase(), M, y, `700 8.5px ${SANS}`, GOLD_INK);
  y += 10;
  hairline(y);
  for (const [label, value] of c.payment) {
    text(label, M, y + 17, `400 9.5px ${SANS}`, INK_3);
    text(value, M + 150, y + 17, `700 10.5px ${SANS}`, INK);
    y += 26;
    hairline(y);
  }

  // Note
  y += 26;
  ctx.font = `400 10px ${SANS}`;
  for (const line of wrap(ctx, c.note, W - 2 * M)) {
    text(line, M, y, `400 10px ${SANS}`, INK_2);
    y += 14.5;
  }

  // Footer
  hairline(H - 44);
  text(c.footer, W / 2, H - 30, `400 8px ${SANS}`, INK_3, "center");
}

/** The receipt as a one-page PDF, to attach to an email or download. */
export async function renderReceiptPdf(content: ReceiptContent): Promise<Buffer> {
  const { canvas, logo } = await pdfAssets();
  const doc = new canvas.PDFDocument({ title: `${content.title} ${content.meta[0][1]}`, author: "NewSpace Africa Conference", creator: "NewSpace Africa Conference registration" });
  draw(doc.beginPage(W, H) as unknown as Ctx, content, logo);
  doc.endPage();
  return doc.close();
}
