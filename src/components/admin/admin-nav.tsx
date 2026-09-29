import type { ReactNode } from "react";
import { IconCog, IconGrid, IconTicket, IconUser } from "@/components/icons";

type NavItem = { href: string; label: string; icon: ReactNode };

// Pages of the staff admin. The main ones sit at the top of the sidebar,
// Admins and Settings at the bottom.
export const ADMIN_NAV: NavItem[] = [
  { href: "/admin", label: "Dashboard", icon: <IconGrid /> },
  { href: "/admin/tickets", label: "Tickets & prices", icon: <IconTicket /> },
];

export const ADMIN_NAV_BOTTOM: NavItem[] = [
  { href: "/admin/admins", label: "Admins", icon: <IconUser className="h-[18px] w-[18px]" /> },
  { href: "/admin/settings", label: "Settings", icon: <IconCog /> },
];

export function isAdminPathActive(pathname: string, href: string) {
  return href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);
}
