import type { NextConfig } from "next";

// HTTPS everywhere. Hosting platforms put the original protocol in the
// x-forwarded-proto header; locally (plain http://localhost) it's absent, so
// none of this applies during development.
const viaHttp = [{ type: "header" as const, key: "x-forwarded-proto", value: "http" }];
const viaHttps = [{ type: "header" as const, key: "x-forwarded-proto", value: "https" }];

const nextConfig: NextConfig = {
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
    ];
  },
};

export default nextConfig;
