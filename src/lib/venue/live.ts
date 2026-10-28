// Keeping open venue maps up to date, built for thousands of visitors at once
// on the free Vercel and Supabase plans.
//
// The page and the booth list are each one shared copy on the CDN, made
// again every BOOTHS_REFRESH_SECONDS (the `revalidate` in src/app/venue/page.tsx
// and src/app/api/venue/booths/route.ts) and straight after an admin saves or
// frees a booth (refreshPublicMap in src/lib/server/booth-assignments.ts). So
// the database is read about once per refresh, however many people look.
//
// Open maps fetch the shared list when someone comes back to the page and
// every BOOTHS_CHECK_MS while it's on screen, at a slightly different moment
// on each phone. No live connection per visitor: Supabase's free plan allows
// only 200 at a time, and Vercel counts every request against a monthly
// allowance. A booth change reaches open maps within about BOOTHS_CHECK_MS.

export const BOOTHS_URL = "/api/venue/booths";
export const BOOTHS_REFRESH_SECONDS = 600;
export const BOOTHS_CHECK_MS = 10 * 60_000;
/** Coming back to the page checks again, but not more often than this. */
export const BOOTHS_MIN_GAP_MS = 2 * 60_000;
