import crypto from "crypto";
import QRCode from "qrcode";
import { publicBaseUrl } from "@/lib/public-url";

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
 * PUBLIC_BASE_URL it falls back to the bare code.
 */
export function ticketQrContent(uniqueCode: string): string {
  const base = publicBaseUrl();
  return base ? `${base}/p/${uniqueCode}` : uniqueCode;
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

export async function generateQrPngBuffer(token: string): Promise<Buffer> {
  return QRCode.toBuffer(token, {
    errorCorrectionLevel: "M",
    margin: 2,
    width: 400,
  });
}
