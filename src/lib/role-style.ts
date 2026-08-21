// Consistent accent color per attendee role, reused across the attendee
// card, the admin table, and the printed badge. Roles are free-text (see
// jotform-mapping.ts), so anything unrecognized falls back to navy.
const ROLE_ACCENTS: Record<string, string> = {
  speaker: "#F09F07",
  host: "#0A4A7A",
  staff: "#1c4f82",
  sponsor: "#123a63",
  delegate: "#0A1A31",
  attendee: "#0A1A31",
};

export function roleAccent(role: string): string {
  return ROLE_ACCENTS[role.toLowerCase()] ?? "#0A1A31";
}
