import sharp from "sharp";
import { describeError } from "@/lib/describe-error";

// Server-side PNG compression for the images we generate (ticket, share
// preview, icons). They are flat artwork with few colours, so a 256-colour
// palette looks the same and is 3 to 4 times smaller. Server-only.

export async function compressPng(input: ArrayBuffer | Buffer): Promise<Buffer> {
  const original = Buffer.isBuffer(input) ? input : Buffer.from(input);
  try {
    const out = await sharp(original).png({ palette: true, quality: 90, effort: 7, compressionLevel: 9 }).toBuffer();
    return out.length < original.length ? out : original;
  } catch (err) {
    // Never fail a ticket over compression: send it as it is.
    console.warn(`PNG compression skipped: ${describeError(err)}`);
    return original;
  }
}

/** An image response, as a compressed PNG. */
export async function compressedPngResponse(image: Response, headers: Record<string, string> = {}): Promise<Response> {
  const body = await compressPng(await image.arrayBuffer());
  return new Response(new Uint8Array(body), {
    headers: { "Content-Type": "image/png", "Content-Length": String(body.length), ...headers },
  });
}
