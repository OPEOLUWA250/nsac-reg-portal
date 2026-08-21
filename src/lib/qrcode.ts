import crypto from "crypto";
import QRCode from "qrcode";

// Opaque, unguessable value embedded in the attendee's QR code and stored
// as `unique_code`. Decoupled from the DB primary key so it can be rotated
// independently.
export function generateUniqueCode(): string {
  return crypto.randomBytes(16).toString("hex");
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
