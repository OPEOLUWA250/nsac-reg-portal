// The deployment this code was built in (next.config.ts sets APP_VERSION to
// the commit on Vercel; empty locally). Admin API responses send it in a
// header, and an admin page built earlier sees a different value and offers
// to reload, so nobody keeps working in an old version after a deploy.

export const APP_VERSION = process.env.APP_VERSION ?? "";
export const APP_VERSION_HEADER = "x-app-version";
/** Window event fired when an admin API response comes from a newer deployment. */
export const APP_UPDATE_EVENT = "nsac:update-available";

/** True when the server is running a newer deployment than this page. */
export function isNewerDeployment(serverVersion: string | null): boolean {
  return Boolean(APP_VERSION && serverVersion && serverVersion !== APP_VERSION);
}
