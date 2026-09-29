"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import StaffGate, { useStaffCode } from "@/components/StaffGate";
import { AdminProvider } from "@/components/admin/AdminContext";

// Layout for every /admin page: staff sign-in, then a sidebar (a tab row
// on phones) next to the page content.

const NAV: { href: string; label: string; icon: ReactNode; soon?: boolean }[] = [
  { href: "/admin", label: "Dashboard", icon: <IconGrid /> },
  { href: "/admin/tickets", label: "Tickets & prices", icon: <IconTicket /> },
  { href: "/admin/settings", label: "Settings", icon: <IconCog /> },
  { href: "/admin/admins", label: "Admins", icon: <IconUsers />, soon: true },
];

export default function AdminShell({ children }: { children: ReactNode }) {
  const { staffCode, saveStaffCode, clearStaffCode } = useStaffCode();
  const pathname = usePathname();

  if (!staffCode) return <StaffGate onSubmit={saveStaffCode} />;

  const isActive = (href: string) => (href === "/admin" ? pathname === "/admin" : pathname.startsWith(href));

  return (
    <AdminProvider staffCode={staffCode} onSignOut={clearStaffCode}>
      <div className="flex-1 flex flex-col lg:flex-row bg-[#F4F6FA]">
        {/* Sidebar (desktop) */}
        <aside className="hidden lg:flex w-64 shrink-0 flex-col bg-navy text-white lg:sticky lg:top-[61px] lg:h-[calc(100vh-61px)]">
          <div className="px-6 pt-7 pb-5">
            <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-gold">Event control</div>
            <div className="mt-1 text-sm text-white/55">NewSpace Africa 2027</div>
          </div>
          <nav className="flex-1 px-3 space-y-1">
            {NAV.map((item) => {
              const active = isActive(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={`relative flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-colors ${
                    active ? "bg-white/10 text-white" : "text-white/65 hover:bg-white/5 hover:text-white"
                  }`}
                >
                  {active && <span className="absolute left-0 top-2 bottom-2 w-1 rounded-full bg-gold" />}
                  <span className={active ? "text-gold" : "text-white/50"}>{item.icon}</span>
                  {item.label}
                  {item.soon && (
                    <span className="ml-auto rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white/60">
                      Soon
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>
          <div className="border-t border-white/10 p-3 space-y-1">
            <Link href="/checkin" className="flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm text-white/65 hover:bg-white/5 hover:text-white">
              <span className="text-white/50"><IconScan /></span>
              Check-in scanner
            </Link>
            <button
              type="button"
              onClick={clearStaffCode}
              className="flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm text-white/65 hover:bg-white/5 hover:text-white"
            >
              <span className="text-white/50"><IconLogout /></span>
              Sign out
            </button>
          </div>
        </aside>

        {/* Tabs (phones / tablets) */}
        <nav className="lg:hidden flex gap-1.5 overflow-x-auto bg-navy px-3 py-2.5">
          {NAV.map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex shrink-0 items-center gap-2 rounded-full px-3.5 py-2 text-sm font-medium ${
                  active ? "bg-gold text-navy" : "text-white/70 hover:bg-white/10"
                }`}
              >
                {item.icon}
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex-1 min-w-0">{children}</div>
      </div>
    </AdminProvider>
  );
}

// ---------- icons (inline SVG, inherit colour) ----------

function Svg({ children }: { children: ReactNode }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  );
}
function IconGrid() {
  return <Svg><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></Svg>;
}
function IconTicket() {
  return <Svg><path d="M3 8a2 2 0 0 0 2-2h14a2 2 0 0 0 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 0-2 2H5a2 2 0 0 0-2-2v-2a2 2 0 0 0 0-4z" /><path d="M13 6v2m0 3v2m0 3v2" /></Svg>;
}
function IconCog() {
  return <Svg><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></Svg>;
}
function IconUsers() {
  return <Svg><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8" /></Svg>;
}
function IconScan() {
  return <Svg><path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M7 12h10" /></Svg>;
}
function IconLogout() {
  return <Svg><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" /></Svg>;
}
