// Accent colour and display name per attendee role, reused across the
// attendee card, the admin table and the printed badge. Roles are free-text
// in older rows (see jotform-mapping.ts), so anything unrecognised falls
// back to the brand blue and a capitalised name.
const ROLE_ACCENTS: Record<string, string> = {
  speaker: "#F09F07",
  vip: "#8A5300",
  media: "#f7c15c",
  press: "#f7c15c",
  exhibitor: "#1D6B43",
  host: "#0A4A7A",
  staff: "#1c4f82",
  delegate: "#03416A",
  attendee: "#03416A",
};

const ROLE_LABELS: Record<string, string> = { vip: "VIP", press: "Media" };

export function roleAccent(role: string): string {
  return ROLE_ACCENTS[role.toLowerCase()] ?? "#03416A";
}

/** "vip" -> "VIP", "exhibitor" -> "Exhibitor". */
export function roleLabel(role: string): string {
  const key = role.toLowerCase();
  return ROLE_LABELS[key] ?? key.charAt(0).toUpperCase() + key.slice(1);
}
