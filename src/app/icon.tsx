import { brandIcon } from "@/lib/brand-icon";

// Browser tab icon (favicon).
export const size = { width: 64, height: 64 };
export const contentType = "image/png";

export default function Icon() {
  return brandIcon(size.width, { rounded: true });
}
