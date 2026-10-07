import type { ReactNode } from "react";
import { IconCog, IconGrid, IconStudent, IconTag, IconTicket, IconUser } from "@/components/icons";

export type NavItem ={ href: string; label: string; icon: ReactNode; superAdminOnly?: boolean };

// Pages of the staff admin. The main ones sit at the top of the sidebar,
// Admins and Settings at the bottom.
export const ADMIN_NAV: NavItem[] = [
  { href: "/admin", label: "Dashboard", icon: <IconGrid /> },
  { href: "/admin/tickets", label: "Tickets & prices", icon: <IconTicket /> },
  { href: "/admin/promo-codes", label: "Promo codes", icon: <IconTag />, superAdminOnly: true },
  { href: "/admin/student-codes", label: "Student codes", icon: <IconStudent /> },
];

export const ADMIN_NAV_BOTTOM: NavItem[] = [
  { href: "/admin/admins", label: "Admins", icon: <IconUser className="h-[18px] w-[18px]" />, superAdminOnly: true },
  { href: "/admin/settings", label: "Settings", icon: <IconCog /> },
];

export function isAdminPathActive(pathname: string, href: string) {
  return href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);
}
