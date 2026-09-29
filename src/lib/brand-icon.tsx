import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { compressedPngResponse } from "@/lib/png";

// Site icon: the NewSpace Africa mark (Africa with an orbit, the conference
// site's own favicon, public/brand/mark.png) on a brand-blue square, so
// it stays visible on both light and dark browser tabs. Used by
// src/app/icon.tsx and src/app/apple-icon.tsx; built once at build time.
export async function brandIcon(size: number, { rounded }: { rounded: boolean }) {
  const mark = await readFile(join(process.cwd(), "public", "brand", "mark.png"));
  const src = `data:image/png;base64,${mark.toString("base64")}`;
  const inner = Math.round(size * 0.8);

  const image = new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#03416A",
          borderRadius: rounded ? size * 0.22 : 0,
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- rendered to PNG by ImageResponse */}
        <img src={src} alt="" width={inner} height={inner} style={{ width: inner, height: inner }} />
      </div>
    ),
    { width: size, height: size }
  );
  // Flat artwork: a palette PNG looks the same at a third of the size.
  return compressedPngResponse(image);
}
