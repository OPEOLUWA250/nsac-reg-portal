"use client";

import BrandLogo from "@/components/BrandLogo";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { AdminProvider, useAdmin } from "@/components/admin/AdminContext";
import { ADMIN_NAV, ADMIN_NAV_BOTTOM, isAdminPathActive } from "@/components/admin/admin-nav";
import { usePopover } from "@/components/usePopover";
import { IconBell, IconChevronDown, IconClose, IconCog, IconMenu, IconScan, IconUser } from "@/components/icons";
import { Button, cx, Skeleton } from "@/components/ui";
import { relativeTime } from "@/lib/admin-format";
import type { ActivityItem } from "@/app/api/admin/activity/route";

// Layout for every /admin page: a blue sidebar (logo top left, page links)
// and a white top bar with notifications and the profile menu. On phones the
// sidebar slides in from a menu button.
//
// TEMPORARY: no sign-in while admin login is being built (see
// ADMIN_SIGN_IN_ENABLED in src/lib/staff-auth.ts). To bring the staff code
// back, wrap this in StaffGate / useStaffCode from @/components/StaffGate as
// the check-in scanner does.

const ACTIVITY_POLL_MS = 30_000;
const SEEN_KEY = "nsac_admin_activity_seen";

const noSignOut = () => {};

export default function AdminShell({ children }: { children: ReactNode }) {
  return (
    <AdminProvider staffCode="" onSignOut={noSignOut}>
      <Frame>{children}</Frame>
    </AdminProvider>
  );
}

function Frame({ children }: { children: ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="flex min-h-dvh flex-1">
      {/* Sidebar (desktop) */}
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 lg:block">
        <Sidebar />
      </aside>

      {/* Sidebar (phones / tablets): slides in over the page */}
      {menuOpen && <MobileSidebar onClose={() => setMenuOpen(false)} />}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-2 border-b border-line bg-surface px-4 sm:px-6 lg:px-8">
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            aria-expanded={menuOpen}
            className="-ml-2 inline-flex h-11 w-11 items-center justify-center rounded-md text-ink transition-colors duration-150 hover:bg-subtle active:bg-line lg:hidden"
          >
            <span className="sr-only">Open menu</span>
            <IconMenu className="h-6 w-6" />
          </button>
          <Link href="/admin" className="flex items-center gap-2 rounded-sm lg:hidden">
            {/* eslint-disable-next-line @next/next/no-img-element -- small pre-sized mark */}
            <img src="/brand/mark-96.png" alt="" width={32} height={32} className="h-8 w-8" />
            <span className="font-display text-base font-bold text-blue">NewSpace Africa</span>
          </Link>
          <p className="hidden text-sm text-ink-3 lg:block">NewSpace Africa Conference 2027 · Event admin</p>

          <div className="ml-auto flex items-center gap-1 sm:gap-2">
            <NotificationBell />
            <ProfileMenu />
          </div>
        </header>

        <main id="main" className="flex-1">
          {children}
        </main>
      </div>
    </div>
  );
}

// ---------- sidebar ----------

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <div className="on-dark flex h-full flex-col bg-blue text-white">
      <div className="flex h-16 shrink-0 items-center px-6">
        <Link href="/admin" onClick={onNavigate} className="rounded-sm" aria-label="NewSpace Africa Conference admin, dashboard">
          <BrandLogo />
        </Link>
      </div>
      <nav aria-label="Admin" className="flex flex-1 flex-col px-3 pt-4">
        <div className="space-y-1">
          {ADMIN_NAV.map((item) => (
            <SidebarLink key={item.href} item={item} active={isAdminPathActive(pathname, item.href)} onNavigate={onNavigate} />
          ))}
        </div>
        <div className="mt-auto space-y-1 border-t border-white/15 py-3">
          {ADMIN_NAV_BOTTOM.map((item) => (
            <SidebarLink key={item.href} item={item} active={isAdminPathActive(pathname, item.href)} onNavigate={onNavigate} />
          ))}
        </div>
      </nav>
    </div>
  );
}

function SidebarLink({
  item,
  active,
  onNavigate,
}: {
  item: (typeof ADMIN_NAV)[number];
  active: boolean;
  onNavigate?: () => void;
}) {
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cx(
        "flex min-h-11 items-center gap-3 rounded-md px-3.5 text-sm font-medium transition-colors duration-150",
        active ? "bg-white/15 text-white" : "text-white/80 hover:bg-white/10 hover:text-white active:bg-white/15"
      )}
    >
      <span className={active ? "text-gold" : "text-white/65"}>{item.icon}</span>
      {item.label}
    </Link>
  );
}

function MobileSidebar({ onClose }: { onClose: () => void }) {
  // Escape closes; focus starts on the close button.
  useEffect(() => {
    document.getElementById("admin-menu-close")?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Admin menu">
      <div aria-hidden="true" onClick={onClose} className="absolute inset-0 bg-blue/50 transition-opacity duration-200 starting:opacity-0" />
      <div className="relative h-full w-72 max-w-[85vw] transition-transform duration-200 ease-out starting:-translate-x-full">
        <Sidebar onNavigate={onClose} />
        <button
          id="admin-menu-close"
          type="button"
          onClick={onClose}
          className="absolute right-2 top-2.5 inline-flex h-11 w-11 items-center justify-center rounded-md text-white/80 transition-colors duration-150 hover:bg-white/10 hover:text-white"
        >
          <span className="sr-only">Close menu</span>
          <IconClose className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}

// ---------- notifications ----------

const ACTIVITY_TEXT: Record<ActivityItem["kind"], string> = {
  paid: "registered and paid",
  pending: "started registering, payment not finished",
  walk_in: "was added as a walk-in",
  checked_in: "checked in",
};

const ACTIVITY_DOT: Record<ActivityItem["kind"], string> = {
  paid: "bg-success",
  pending: "bg-danger",
  walk_in: "bg-gold",
  checked_in: "bg-blue",
};

function readSeen(): number {
  try {
    return Number(localStorage.getItem(SEEN_KEY)) || 0;
  } catch {
    return 0;
  }
}

function NotificationBell() {
  const { apiCall, setRequestedAttendee } = useAdmin();
  const router = useRouter();
  const [items, setItems] = useState<ActivityItem[] | null>(null);
  const [error, setError] = useState("");
  const [seen, setSeen] = useState(readSeen);
  const itemsRef = useRef(items);
  useEffect(() => {
    itemsRef.current = items;
  });

  const markAllRead = useCallback(() => {
    const newest = itemsRef.current?.[0] ? new Date(itemsRef.current[0].at).getTime() : Date.now();
    try {
      localStorage.setItem(SEEN_KEY, String(newest));
    } catch {
      /* storage blocked: read state lasts for this page only */
    }
    setSeen(newest);
  }, []);

  // Closing the panel counts as having seen what was in it.
  const { open, setOpen, wrap, trigger } = usePopover(markAllRead);

  const load = useCallback(async () => {
    try {
      const json = await apiCall("/api/admin/activity");
      setItems(json.items as ActivityItem[]);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load notifications.");
    }
  }, [apiCall]);

  useEffect(() => {
    const first = setTimeout(load, 0);
    const interval = setInterval(load, ACTIVITY_POLL_MS);
    return () => {
      clearTimeout(first);
      clearInterval(interval);
    };
  }, [load]);

  const unread = (items ?? []).filter((i) => new Date(i.at).getTime() > seen).length;

  function openAttendee(id: string) {
    setRequestedAttendee(id);
    setOpen(false);
    router.push("/admin");
  }

  return (
    <div ref={wrap} className="relative">
      <button
        ref={trigger}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls="notifications"
        className="relative inline-flex h-11 w-11 items-center justify-center rounded-md text-ink-2 transition-colors duration-150 hover:bg-subtle hover:text-ink active:bg-line"
      >
        <IconBell />
        <span className="sr-only">Notifications{unread ? `, ${unread} new` : ""}</span>
        {unread > 0 && (
          <span aria-hidden="true" className="absolute right-1.5 top-1.5 inline-flex min-w-5 items-center justify-center rounded-full bg-danger px-1 text-xs font-semibold leading-5 text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          id="notifications"
          role="dialog"
          aria-label="Notifications"
          className="fixed inset-x-4 top-16 z-40 mt-1 rounded-lg border border-line bg-surface transition-[opacity,translate] duration-200 starting:-translate-y-1 starting:opacity-0 sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:w-96"
        >
          <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-2">
            <h2 className="text-sm font-semibold text-ink">Notifications</h2>
            <Button variant="ghost" size="sm" onClick={markAllRead} disabled={!unread} data-autofocus>
              Mark all as read
            </Button>
          </div>
          <div className="max-h-[min(28rem,70dvh)] overflow-y-auto">
            {items === null && !error ? (
              <div className="space-y-3 p-4">
                <span role="status" className="sr-only">Loading notifications</span>
                {[0, 1, 2].map((i) => (
                  <div key={i} className="flex gap-3">
                    <Skeleton className="mt-1 h-2 w-2 rounded-full" />
                    <div className="flex-1 space-y-1.5">
                      <Skeleton className="h-4 w-3/4" />
                      <Skeleton className="h-3 w-20" />
                    </div>
                  </div>
                ))}
              </div>
            ) : error && !items ? (
              <div className="space-y-3 p-4 text-sm text-ink-2" role="alert">
                <p>{error}</p>
                <Button variant="outline" size="sm" onClick={load}>
                  Try again
                </Button>
              </div>
            ) : !items?.length ? (
              <p className="p-6 text-center text-sm text-ink-3">No activity yet. New registrations, payments and check-ins will show up here.</p>
            ) : (
              <ul className="divide-y divide-line">
                {items.map((item) => {
                  const isNew = new Date(item.at).getTime() > seen;
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => openAttendee(item.attendeeId)}
                        className={cx(
                          "flex w-full items-start gap-3 px-4 py-3 text-left text-sm transition-colors duration-150 hover:bg-canvas active:bg-subtle",
                          isNew && "bg-canvas"
                        )}
                      >
                        <span aria-hidden="true" className={cx("mt-1.5 h-2 w-2 shrink-0 rounded-full", ACTIVITY_DOT[item.kind])} />
                        <span className="min-w-0 flex-1">
                          <span className="block text-ink">
                            <span className="font-semibold">{item.name}</span> {ACTIVITY_TEXT[item.kind]}
                          </span>
                          <span className="block text-xs text-ink-3">
                            {relativeTime(item.at)}
                            {isNew && <span className="font-semibold text-gold-ink"> · New</span>}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- profile ----------

function ProfileMenu() {
  const { open, setOpen, wrap, trigger } = usePopover();

  return (
    <div ref={wrap} className="relative">
      <button
        ref={trigger}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls="profile-menu"
        className="flex min-h-11 items-center gap-2.5 rounded-md py-1 pl-1 pr-2 transition-colors duration-150 hover:bg-subtle active:bg-line sm:border sm:border-line sm:pl-1.5"
      >
        <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue text-white">
          <IconUser className="h-4 w-4" />
        </span>
        <span className="hidden text-left leading-tight sm:block">
          <span className="block text-sm font-semibold text-ink">Event admin</span>
          <span className="block text-xs text-ink-3">No sign-in yet</span>
        </span>
        <IconChevronDown className="hidden h-4 w-4 text-ink-3 sm:block" />
        <span className="sr-only sm:hidden">Profile</span>
      </button>

      {open && (
        <div
          id="profile-menu"
          role="dialog"
          aria-label="Profile"
          className="absolute right-0 top-full z-40 mt-2 w-64 rounded-lg border border-line bg-surface p-1.5 transition-[opacity,translate] duration-200 starting:-translate-y-1 starting:opacity-0"
        >
          <div className="border-b border-line px-3 pb-3 pt-2">
            <p className="text-sm font-semibold text-ink">Event admin</p>
            <p className="text-xs text-ink-3">The admin has no sign-in yet: anyone with its address can open it.</p>
          </div>
          <div className="py-1.5">
            <MenuLink href="/admin/settings" onClick={() => setOpen(false)} icon={<IconCog />}>
              Settings
            </MenuLink>
            <MenuLink href="/checkin" onClick={() => setOpen(false)} icon={<IconScan />}>
              Check-in scanner
            </MenuLink>
          </div>
        </div>
      )}
    </div>
  );
}

function MenuLink({ href, onClick, icon, children }: { href: string; onClick: () => void; icon: ReactNode; children: ReactNode }) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className="flex min-h-11 items-center gap-3 rounded-md px-3 text-sm text-ink transition-colors duration-150 hover:bg-subtle active:bg-line"
    >
      <span className="text-ink-3">{icon}</span>
      {children}
    </Link>
  );
}
