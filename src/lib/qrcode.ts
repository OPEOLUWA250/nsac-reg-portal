import crypto from "crypto";
import QRCode from "qrcode";
import { publicBaseUrl, toHttps } from "@/lib/public-url";

// Opaque, unguessable value embedded in the attendee's QR code and stored
// as `unique_code`. Decoupled from the DB primary key so it can be rotated
// independently.
export function generateUniqueCode(): string {
  return crypto.randomBytes(16).toString("hex");
}

/**
 * What an attendee's QR code holds: a link to their contact page
 * (/p/<code>), so a phone camera opens it (details shown only if they agreed
 * to share). The check-in scanner reads the code back out of the link. Without
 * PUBLIC_BASE_URL it uses the Vercel production domain when available.
 */
export function ticketQrContent(uniqueCode: string): string {
  const base = publicBaseUrl() || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? toHttps(process.env.VERCEL_PROJECT_PRODUCTION_URL) : null);
  if (!base) throw new Error("Set PUBLIC_BASE_URL before generating attendee QR codes.");
  return `${base}/p/${uniqueCode}`;
}

/** The attendee code from a scanned QR: a /p/<code> link or the bare code. */
export function codeFromQr(scanned: string): string {
  const text = scanned.trim();
  const match = text.match(/\/p\/([A-Za-z0-9]+)\/?(?:[?#].*)?$/);
  return match ? match[1] : text;
}

export async function generateQrPngDataUrl(token: string): Promise<string> {
  return QRCode.toDataURL(token, {
    errorCorrectionLevel: "M",
    margin: 2,
    width: 400,
  });
}

/** Vector QR for the printed badge, so it stays sharp at any printer resolution. */
export async function generateQrSvgDataUrl(token: string): Promise<string> {
  const svg = await QRCode.toString(token, { type: "svg", errorCorrectionLevel: "M", margin: 1 });
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

export async function generateQrPngBuffer(token: string): Promise<Buffer> {
  return QRCode.toBuffer(token, {
    errorCorrectionLevel: "M",
    margin: 2,
    width: 400,
  });
}
