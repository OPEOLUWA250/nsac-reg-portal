import "server-only";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { brandLogoPng } from "@/lib/ticket-image";
import { describeError } from "@/lib/describe-error";

// What the PDFs we write (invitation letters, payment receipts) are drawn
// with: the canvas library, the site's fonts (src/app/fonts, packaged with
// every function: next.config.ts) and the white logo. Loaded once per server.

export type Canvas = typeof import("@napi-rs/canvas");
/** A PDF page and a picture canvas take the same drawing calls. */
export type Ctx = import("@napi-rs/canvas").SKRSContext2D;
export type Img = Awaited<ReturnType<Canvas["loadImage"]>>;

export const PDF_SANS = "'NSAC Sans', 'Helvetica Neue', Arial, sans-serif";
export const PDF_DISPLAY = "'NSAC Display', 'Helvetica Neue', Arial, sans-serif";

let setup: Promise<{ canvas: Canvas; logo: Img | null }> | null = null;

export function pdfAssets() {
  setup ??= (async () => {
    const canvas = await import("@napi-rs/canvas");
    const dir = join(process.cwd(), "src", "app", "fonts");
    for (const [file, name] of [["dm-sans.woff2", "NSAC Sans"], ["nsac-display.woff2", "NSAC Display"]]) {
      if (canvas.GlobalFonts.has(name)) continue;
      try {
        canvas.GlobalFonts.register(await readFile(join(dir, file)), name);
      } catch (err) {
        console.warn(`PDF font ${file} unavailable, using a fallback: ${describeError(err)}`);
      }
    }
    const png = await brandLogoPng();
    const logo = png ? await canvas.loadImage(png).catch(() => null) : null;
    return { canvas, logo };
  })();
  return setup;
}

/** Splits text into lines that fit `width` in the context's current font. */
export function wrapText(ctx: Ctx, text: string, width: number): string[] {
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
