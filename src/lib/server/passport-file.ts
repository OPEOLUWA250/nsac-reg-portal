import "server-only";
import sharp from "sharp";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { PASSPORT_MIME_TYPES } from "@/lib/registration-fields";
import { describeError } from "@/lib/describe-error";

// An attendee's passport from the private "passports" bucket, plus a picture
// of it for places that can only show images: the registration alert email
// and the dashboard drawer. A photo is used as it is (shrunk); a PDF has its
// first page drawn. Passports are never public: callers are server code for
// staff only.

export interface PassportFile {
  /** The file as uploaded. */
  content: Buffer;
  contentType: string;
  /** "passport.pdf", "passport.jpg", ... */
  name: string;
}

export interface PassportPicture {
  content: Buffer;
  contentType: "image/jpeg";
  width: number;
  height: number;
}

const BY_EXTENSION: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  pdf: "application/pdf",
};

/** Long side of the picture: readable on a phone or laptop, small in an email. */
const PICTURE_MAX_PX = 1400;

/**
 * The passport an attendee uploaded, or null when there's none (the upload
 * link was handed out but nothing arrived, or the attendee has no passport).
 */
export async function getPassportFile(attendeeId: string): Promise<PassportFile | null> {
  const bucket = supabaseAdmin().storage.from("passports");
  const { data: files, error: listError } = await bucket.list(attendeeId);
  if (listError) throw listError;
  const name = files?.find((f) => f.name.startsWith("passport."))?.name;
  if (!name) return null;
  const { data, error } = await bucket.download(`${attendeeId}/${name}`);
  if (error || !data) throw error ?? new Error("empty download");
  // Trust the stored type when it is one we accept, else go by the extension.
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  const contentType = (PASSPORT_MIME_TYPES as readonly string[]).includes(data.type)
    ? data.type
    : (BY_EXTENSION[ext] ?? "application/octet-stream");
  return { content: Buffer.from(await data.arrayBuffer()), contentType, name };
}

/**
 * A JPEG of the passport: the photo itself, or the first page of a PDF.
 * Null if it can't be drawn (a damaged or password-protected PDF).
 */
export async function passportPicture(file: PassportFile): Promise<PassportPicture | null> {
  try {
    const source = file.contentType === "application/pdf" ? await renderFirstPdfPage(file.content) : file.content;
    const { data, info } = await sharp(source)
      .rotate() // honour the phone's orientation flag
      .resize({ width: PICTURE_MAX_PX, height: PICTURE_MAX_PX, fit: "inside", withoutEnlargement: true })
      .flatten({ background: "#ffffff" })
      .jpeg({ quality: 80, mozjpeg: true })
      .toBuffer({ resolveWithObject: true });
    return { content: data, contentType: "image/jpeg", width: info.width, height: info.height };
  } catch (err) {
    console.warn(`Couldn't draw the passport (${file.contentType}): ${describeError(err)}`);
    return null;
  }
}

/** Page 1 of a PDF as a PNG, about PICTURE_MAX_PX on its long side. */
async function renderFirstPdfPage(pdf: Buffer): Promise<Buffer> {
  // Loaded only when needed. Importing the worker up front lets pdf.js run it
  // in this process (no worker thread) and makes sure it's deployed.
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  await import("pdfjs-dist/legacy/build/pdf.worker.mjs");
  const task = pdfjs.getDocument({
    data: new Uint8Array(pdf),
    disableFontFace: true,
    useSystemFonts: false,
  });
  try {
    const doc = await task.promise;
    const page = await doc.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const scale = Math.min(4, PICTURE_MAX_PX / Math.max(base.width, base.height));
    const viewport = page.getViewport({ scale });
    const { createCanvas } = await import("@napi-rs/canvas");
    const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    const context = canvas.getContext("2d");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({
      canvas: canvas as unknown as HTMLCanvasElement,
      canvasContext: context as unknown as CanvasRenderingContext2D,
      viewport,
    }).promise;
    return canvas.toBuffer("image/png");
  } finally {
    await task.destroy();
  }
}
