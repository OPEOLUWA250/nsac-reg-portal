import type { NextConfig } from "next";

// HTTPS everywhere. Hosting platforms put the original protocol in the
// x-forwarded-proto header; locally (plain http://localhost) it's absent, so
// none of this applies during development.
const viaHttp = [{ type: "header" as const, key: "x-forwarded-proto", value: "http" }];
const viaHttps = [{ type: "header" as const, key: "x-forwarded-proto", value: "https" }];

const nextConfig: NextConfig = {
  // Which deployment this build is (the commit on Vercel; empty locally).
  // Admin API responses carry it, so an admin page left open across a
  // deploy can offer a reload (src/lib/app-version.ts).
  env: { APP_VERSION: process.env.VERCEL_GIT_COMMIT_SHA ?? "" },
  // Files the server reads from disk (not just serves), so hosting platforms
  // package them with the functions: brand logos for tickets, emails and
  // icons, and the partner logos the flyer page lists.
  outputFileTracingIncludes: {
    "/*": ["./public/brand/*.png"],
    "/flyer": ["./public/brand/partners/**/*"],
  },
  async redirects() {
    return [
      {
        // Anyone arriving over http:// is sent to the same page over https://
        // (308: permanent, and form posts stay posts).
        source: "/:path*",
        has: [...viaHttp, { type: "host", value: "(?<host>.+)" }],
        destination: "https://:host/:path*",
        permanent: true,
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        has: viaHttps,
        headers: [
          // Browsers use https:// for this site (and its subdomains) for the
          // next two years, without trying http:// first.
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
          // Any http:// image, script or link on a page is loaded over https://.
          { key: "Content-Security-Policy", value: "upgrade-insecure-requests" },
        ],
      },
      {
        source: "/:path*",
        headers: [
          // Browsers trust the declared file type (no guessing an upload is a script).
          { key: "X-Content-Type-Options", value: "nosniff" },
          // Full URLs (e.g. ?session_id= on the success page) never go to other sites.
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
      // Staff pages can't be shown inside another site's frame (clickjacking).
      // Public pages stay embeddable, e.g. in the conference website.
      ...["/admin/:path*", "/checkin/:path*"].map((source) => ({
        source,
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'; upgrade-insecure-requests" },
        ],
      })),
    ];
  },
};

export default nextConfig;
