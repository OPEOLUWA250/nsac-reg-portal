// The site's public address (PUBLIC_BASE_URL), used in emails, Stripe's
// return links, the flyer's QR code and link previews. Always https:// for
// a real domain, even if the setting says http://, so no link we send out
// is insecure. Only localhost may stay on http:// (local development).

const LOCAL = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i;

/**
 * The registration site's official address. Printed things (the venue QR
 * stickers) always use it, whatever PUBLIC_BASE_URL says, so a sheet printed
 * from a preview or a laptop still works at the venue.
 */
export const OFFICIAL_SITE_URL = "https://registration.newspace.spaceinafrica.com";

export function toHttps(url: string): string {
  // No scheme ("register.example.com"): https, or http for localhost.
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(url)
    ? url
    : `${LOCAL.test(url.split("/")[0]) ? "http" : "https"}://${url}`;
  try {
    const u = new URL(withScheme);
    if (u.protocol === "http:" && !LOCAL.test(u.host)) u.protocol = "https:";
    return u.toString().replace(/\/$/, "");
  } catch {
    return url.replace(/\/$/, "");
  }
}

/** PUBLIC_BASE_URL without a trailing slash, or null when it isn't set. */
export function publicBaseUrl(): string | null {
  const raw = process.env.PUBLIC_BASE_URL?.trim();
  return raw ? toHttps(raw) : null;
}
