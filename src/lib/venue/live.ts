// Live booth updates on the venue map. When an admin saves or frees a booth,
// the server sends "changed" on this Supabase Realtime channel; open maps
// then fetch the booth list again from /api/venue/booths. The message carries
// nothing, so reserved companies' names never travel over it.

export const BOOTHS_CHANNEL = "venue-booths";
export const BOOTHS_CHANGED = "changed";
export const BOOTHS_URL = "/api/venue/booths";
