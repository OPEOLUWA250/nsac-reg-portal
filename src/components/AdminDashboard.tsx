"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useAdmin } from "@/components/admin/AdminContext";
import AttendeeDrawer, { Avatar } from "@/components/AttendeeDrawer";
import {
  AdminPage,
  Alert,
  Button,
  Card,
  cx,
  describedBy,
  EmptyState,
  ErrorState,
  Field,
  inputClass,
  LoadingLabel,
  PageHeader,
  PaymentBadge,
  RolePill,
  Skeleton,
  StatusPill,
} from "@/components/ui";
import { IconDownload, IconRefresh, IconSearch } from "@/components/icons";
import { buildAttendeeCsv, categoryLabel, money, relativeTime } from "@/lib/admin-format";
import { EVENT_INFO } from "@/lib/event-info";
import { roleLabel } from "@/lib/role-style";
import { ATTENDEE_ROLES, type Attendee } from "@/lib/types";
import type { Ticket } from "@/lib/tickets";

const POLL_INTERVAL_MS = 20_000;
const PAGE_SIZE = 25;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Sort = "newest" | "oldest" | "name";

interface Filters {
  search: string;
  payment: "all" | "paid" | "walk_in" | "pending";
  ticket: string; // "all" | ticket id
  role: string; // "all" | role
  checkin: "all" | "in" | "out";
  letter: boolean; // only people needing an invitation letter
}

const NO_FILTERS: Filters = { search: "", payment: "all", ticket: "all", role: "all", checkin: "all", letter: false };

interface RegisterForm {
  fullName: string;
  email: string;
  role: string;
  organization: string;
  phone: string;
}

const EMPTY_FORM: RegisterForm = { fullName: "", email: "", role: "delegate", organization: "", phone: "" };

export default function AdminDashboard() {
  const { apiCall, requestedAttendee, setRequestedAttendee } = useAdmin();
  const [attendees, setAttendees] = useState<Attendee[] | null>(null);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loadError, setLoadError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [sort, setSort] = useState<Sort>("newest");
  const [page, setPage] = useState(0);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [rowBusy, setRowBusy] = useState<Record<string, boolean>>({});
  const [rowMessage, setRowMessage] = useState<Record<string, string>>({});

  const [walkInOpen, setWalkInOpen] = useState(false);
  const [form, setForm] = useState<RegisterForm>(EMPTY_FORM);
  const [formErrors, setFormErrors] = useState<Partial<Record<keyof RegisterForm, string>>>({});
  const [registering, setRegistering] = useState(false);
  const [registerError, setRegisterError] = useState("");
  const [registerDone, setRegisterDone] = useState("");

  const loadAttendees = useCallback(async () => {
    setRefreshing(true);
    try {
      const { attendees } = await apiCall("/api/admin/attendees");
      setAttendees(attendees as Attendee[]);
      setLoadError("");
      setLastUpdated(new Date());
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Couldn't load registrations.");
    } finally {
      setRefreshing(false);
    }
  }, [apiCall]);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      if (!cancelled) loadAttendees();
    };
    const first = setTimeout(load, 0);
    const interval = setInterval(load, POLL_INTERVAL_MS);
    // Ticket names for labels (managed on the Tickets & prices page).
    apiCall("/api/admin/tickets").then(
      (json) => !cancelled && setTickets(json.tickets as Ticket[]),
      () => {}
    );
    return () => {
      cancelled = true;
      clearTimeout(first);
      clearInterval(interval);
    };
  }, [apiCall, loadAttendees]);

  // Opened from a notification: show that person's details once the list is here.
  useEffect(() => {
    if (!requestedAttendee || !attendees) return;
    if (attendees.some((a) => a.id === requestedAttendee)) setSelectedId(requestedAttendee);
    setRequestedAttendee(null);
  }, [requestedAttendee, attendees, setRequestedAttendee]);

  const ticketName = useCallback(
    (id: string | null) => {
      if (!id) return "";
      return tickets.find((t) => t.id === id)?.name.en ?? id.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    },
    [tickets]
  );

  // ---------- stats ----------

  const stats = useMemo(() => {
    const list = attendees ?? [];
    const paid = list.filter((a) => a.payment_status === "paid");
    const revenueCents = paid.reduce((sum, a) => sum + (a.amount_cents ?? 0), 0);
    const count = (key: (a: Attendee) => string | null | undefined, limit = 5) => {
      const map = new Map<string, number>();
      for (const a of list) {
        const k = key(a);
        if (k) map.set(k, (map.get(k) ?? 0) + 1);
      }
      return [...map.entries()].sort((x, y) => y[1] - x[1]).slice(0, limit);
    };
    const dayAgo = Date.now() - 24 * 3600_000;
    return {
      total: list.length,
      newToday: list.filter((a) => new Date(a.created_at).getTime() > dayAgo).length,
      paid: paid.length,
      revenueCents,
      currency: paid[0]?.currency ?? "eur",
      pending: list.filter((a) => a.payment_status === "pending").length,
      walkIns: list.filter((a) => a.source === "walk_in").length,
      perTicket: list.reduce<Record<string, number>>((acc, a) => {
        if (a.ticket_type) acc[a.ticket_type] = (acc[a.ticket_type] ?? 0) + 1;
        return acc;
      }, {}),
      checkedIn: list.filter((a) => a.checked_in).length,
      letters: list.filter((a) => a.needs_invitation_letter).length,
      lettersNoPassport: list.filter((a) => a.needs_invitation_letter && !a.passport_path).length,
      byTicket: count((a) => (a.ticket_type ? ticketName(a.ticket_type) : null)),
      byCountry: count((a) => a.nationality),
      byCategory: count((a) => categoryLabel(a.professional_category)),
    };
  }, [attendees, ticketName]);

  // ---------- filtering ----------

  const roles = useMemo(
    () => Array.from(new Set([...(attendees ?? []).map((a) => a.role), ...ATTENDEE_ROLES])).sort(),
    [attendees]
  );
  const ticketIds = useMemo(
    () => Array.from(new Set([...tickets.map((t) => t.id), ...(attendees ?? []).map((a) => a.ticket_type).filter(Boolean)])) as string[],
    [tickets, attendees]
  );

  const filtered = useMemo(() => {
    const q = filters.search.trim().toLowerCase();
    const list = (attendees ?? []).filter((a) => {
      if (filters.payment === "walk_in" ? a.source !== "walk_in" : filters.payment !== "all" && a.payment_status !== filters.payment) return false;
      if (filters.ticket !== "all" && a.ticket_type !== filters.ticket) return false;
      if (filters.role !== "all" && a.role !== filters.role) return false;
      if (filters.checkin === "in" && !a.checked_in) return false;
      if (filters.checkin === "out" && a.checked_in) return false;
      if (filters.letter && !a.needs_invitation_letter) return false;
      if (q) {
        const haystack = [a.full_name, a.email, a.organization, a.job_title, a.phone, a.nationality, a.id.slice(0, 8)]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
    return list.sort((x, y) => {
      if (sort === "name") return x.full_name.localeCompare(y.full_name);
      const diff = new Date(x.created_at).getTime() - new Date(y.created_at).getTime();
      return sort === "oldest" ? diff : -diff;
    });
  }, [attendees, filters, sort]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const pageRows = filtered.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);
  const activeFilters = JSON.stringify(filters) !== JSON.stringify(NO_FILTERS);

  function setFilter<K extends keyof Filters>(key: K, value: Filters[K]) {
    setFilters((f) => ({ ...f, [key]: value }));
    setPage(0);
  }

  // ---------- actions ----------

  async function withRow(id: string, action: () => Promise<string | void>) {
    setRowBusy((s) => ({ ...s, [id]: true }));
    setRowMessage((s) => ({ ...s, [id]: "" }));
    try {
      const msg = await action();
      if (msg) setRowMessage((s) => ({ ...s, [id]: msg }));
    } catch (err) {
      setRowMessage((s) => ({ ...s, [id]: err instanceof Error ? err.message : "Something went wrong" }));
    } finally {
      setRowBusy((s) => ({ ...s, [id]: false }));
    }
  }

  const handleResend = (id: string) =>
    withRow(id, async () => {
      await apiCall("/api/admin/resend-qr", { method: "POST", body: JSON.stringify({ id }) });
      loadAttendees();
      return "QR email sent.";
    });

  const handleToggleCheckIn = (id: string, checkedIn: boolean) =>
    withRow(id, async () => {
      const { attendee } = await apiCall("/api/admin/toggle-checkin", {
        method: "POST",
        body: JSON.stringify({ id, checkedIn }),
      });
      setAttendees((prev) => (prev ? prev.map((a) => (a.id === id ? (attendee as Attendee) : a)) : prev));
      return checkedIn ? "Checked in." : "Check-in undone.";
    });

  async function handleDelete(a: Attendee) {
    const ok = window.confirm(
      `Delete ${a.full_name}'s registration permanently?\n\nTheir ticket and QR code stop working and their passport file is deleted. A payment isn't refunded: do that in Stripe. This can't be undone.`
    );
    if (!ok) return;
    setRowBusy((s) => ({ ...s, [a.id]: true }));
    try {
      await apiCall(`/api/admin/attendees?id=${encodeURIComponent(a.id)}`, { method: "DELETE" });
      setSelectedId(null);
      setAttendees((prev) => (prev ? prev.filter((x) => x.id !== a.id) : prev));
    } catch (err) {
      setRowMessage((s) => ({ ...s, [a.id]: err instanceof Error ? err.message : "Couldn't delete." }));
    } finally {
      setRowBusy((s) => ({ ...s, [a.id]: false }));
    }
  }

  function handleViewPassport(id: string) {
    // Open the tab first (inside the click) so pop-up blockers allow it.
    const tab = window.open("", "_blank");
    withRow(id, async () => {
      try {
        const { url } = (await apiCall("/api/admin/passport", { method: "POST", body: JSON.stringify({ id }) })) as { url: string };
        if (tab) tab.location.href = url;
        else window.location.href = url;
      } catch (err) {
        tab?.close();
        throw err;
      }
    });
  }

  function updateForm<K extends keyof RegisterForm>(key: K, value: RegisterForm[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    setFormErrors((e) => ({ ...e, [key]: undefined }));
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    const errs: typeof formErrors = {};
    if (!form.fullName.trim()) errs.fullName = "Enter their full name.";
    if (!form.email.trim()) errs.email = "Enter their email address. Their QR code is sent there.";
    else if (!EMAIL_RE.test(form.email.trim())) errs.email = "This doesn't look like an email address.";
    setFormErrors(errs);
    if (Object.keys(errs).length) {
      document.getElementById(`walkin-${Object.keys(errs)[0]}`)?.focus();
      return;
    }
    setRegistering(true);
    setRegisterError("");
    setRegisterDone("");
    try {
      await apiCall("/api/admin/register", { method: "POST", body: JSON.stringify(form) });
      setRegisterDone(`${form.fullName.trim()} is registered. Their QR code was emailed to ${form.email.trim()}.`);
      setForm(EMPTY_FORM);
      loadAttendees();
    } catch (err) {
      setRegisterError(err instanceof Error ? err.message : "Registration failed.");
    } finally {
      setRegistering(false);
    }
  }

  function exportCsv(list: Attendee[], label: string) {
    const blob = buildAttendeeCsv(list, ticketName);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `nsac-2027-registrations-${label}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const selected = attendees?.find((a) => a.id === selectedId) ?? null;
  const checkInRate = stats.total ? Math.round((stats.checkedIn / stats.total) * 100) : 0;
  const loading = attendees === null && !loadError;

  return (
    <AdminPage width="max-w-7xl">
      <PageHeader
        eyebrow="Dashboard"
        title="Registrations"
        description={`${EVENT_INFO.name.en} · ${EVENT_INFO.date.en} · ${EVENT_INFO.place.en}`}
        actions={
          <>
            <Button
              variant="outline"
              size="md"
              onClick={loadAttendees}
              disabled={refreshing}
              aria-label="Refresh registrations"
              title="Refresh"
              className="px-3"
            >
              <IconRefresh className={cx("h-4 w-4", refreshing && "animate-spin")} />
            </Button>
            <ExportMenu
              disabled={!attendees?.length}
              options={[
                { label: "Current view", count: filtered.length, run: () => exportCsv(filtered, activeFilters ? "filtered" : "all") },
                { label: "Everyone", count: attendees?.length ?? 0, run: () => exportCsv(attendees ?? [], "all") },
                { label: "Invitation letters", count: stats.letters, run: () => exportCsv((attendees ?? []).filter((a) => a.needs_invitation_letter), "invitation-letters") },
              ]}
            />
            <Button
              variant="primary"
              onClick={() => {
                setWalkInOpen((o) => !o);
                setRegisterDone("");
                setRegisterError("");
              }}
              aria-expanded={walkInOpen}
              aria-controls="walkin-panel"
            >
              {walkInOpen ? "Close walk-in form" : "Add walk-in"}
            </Button>
          </>
        }
      />

      {loadError && attendees !== null && (
        <Alert tone="error" title="Couldn't refresh" action={<Button size="sm" variant="outline" onClick={loadAttendees}>Try again</Button>}>
          {loadError} Showing the list from {lastUpdated ? relativeTime(lastUpdated.toISOString()) : "earlier"}.
        </Alert>
      )}

      {walkInOpen && (
        <Card id="walkin-panel" className="space-y-4 p-5 transition-opacity duration-200 starting:opacity-0 sm:p-6">
          <div className="space-y-1">
            <h2 className="font-display text-xl font-bold text-blue">Walk-in registration</h2>
            <p className="text-sm text-ink-3">
              For speakers, staff, guests or people registering at the desk. No payment is needed and their QR code is emailed straight away.
            </p>
          </div>
          {registerDone && <Alert tone="success">{registerDone}</Alert>}
          {registerError && <Alert tone="error">{registerError}</Alert>}
          <form onSubmit={handleRegister} noValidate className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field id="walkin-fullName" label="Full name" required error={formErrors.fullName}>
              <input id="walkin-fullName" className={inputClass(!!formErrors.fullName)} value={form.fullName} onChange={(e) => updateForm("fullName", e.target.value)} aria-invalid={!!formErrors.fullName} aria-describedby={describedBy("walkin-fullName", { error: formErrors.fullName })} autoComplete="off" />
            </Field>
            <Field id="walkin-email" label="Email" required error={formErrors.email}>
              <input id="walkin-email" type="email" inputMode="email" className={inputClass(!!formErrors.email)} value={form.email} onChange={(e) => updateForm("email", e.target.value)} aria-invalid={!!formErrors.email} aria-describedby={describedBy("walkin-email", { error: formErrors.email })} autoComplete="off" />
            </Field>
            <Field id="walkin-role" label="Role">
              <select id="walkin-role" className={inputClass()} value={form.role} onChange={(e) => updateForm("role", e.target.value)}>
                {ATTENDEE_ROLES.map((role) => (
                  <option key={role} value={role}>{roleLabel(role)}</option>
                ))}
              </select>
            </Field>
            <Field id="walkin-organization" label="Organisation" optionalLabel="optional">
              <input id="walkin-organization" className={inputClass()} value={form.organization} onChange={(e) => updateForm("organization", e.target.value)} autoComplete="off" />
            </Field>
            <Field id="walkin-phone" label="Phone" optionalLabel="optional">
              <input id="walkin-phone" type="tel" inputMode="tel" className={inputClass()} value={form.phone} onChange={(e) => updateForm("phone", e.target.value)} autoComplete="off" />
            </Field>
            <div className="flex items-end">
              <Button type="submit" variant="secondary" className="w-full" loading={registering}>
                {registering ? "Registering" : "Register and send QR code"}
              </Button>
            </div>
          </form>
        </Card>
      )}

      {loading ? (
        <DashboardSkeleton />
      ) : attendees === null ? (
        <ErrorState title="Couldn't load registrations" message={loadError} onRetry={loadAttendees} />
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
            <Kpi label="Registrations" value={stats.total} sub={stats.newToday ? `+${stats.newToday} in the last 24 h` : "None new in 24 h"} />
            <Kpi label="Paid" value={stats.paid} sub={stats.total ? `${Math.round((stats.paid / stats.total) * 100)}% of all` : "No registrations yet"} />
            <Kpi label="Revenue" value={money(stats.revenueCents, stats.currency) || "€0"} sub="From paid tickets" />
            <Kpi
              label="Awaiting payment"
              value={stats.pending}
              sub={stats.pending ? "Show them" : "Started, not paid"}
              alert={stats.pending > 0}
              onClick={stats.pending ? () => setFilter("payment", "pending") : undefined}
            />
            <Kpi label="Checked in" value={stats.checkedIn} sub={`${checkInRate}% of registrations`} />
            <Kpi
              label="Invitation letters"
              value={stats.letters}
              sub={stats.lettersNoPassport ? `${stats.lettersNoPassport} without passport` : "All have passports"}
              onClick={stats.letters ? () => setFilter("letter", true) : undefined}
            />
          </div>

          {stats.total > 0 && (
            <div className="grid gap-3 md:grid-cols-3">
              <Breakdown title="By ticket" rows={stats.byTicket} total={stats.total} />
              <Breakdown title="Top nationalities" rows={stats.byCountry} total={stats.total} />
              <Breakdown title="By professional category" rows={stats.byCategory} total={stats.total} />
            </div>
          )}

          {/* Filters + list. Columns follow the card's own width (container
              queries), since the sidebar takes part of the screen. */}
          <Card className="@container overflow-hidden">
            <div className="space-y-3 border-b border-line p-4">
              <div className="flex flex-wrap items-center gap-2.5">
                <div className="relative min-w-0 flex-1 basis-60">
                  <IconSearch className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" />
                  <label htmlFor="search" className="sr-only">Search registrations</label>
                  <input
                    id="search"
                    type="search"
                    className={inputClass(false, "pl-10")}
                    placeholder="Search name, email, organisation, phone, reference"
                    value={filters.search}
                    onChange={(e) => setFilter("search", e.target.value)}
                  />
                </div>
                <FilterSelect label="Sort" value={sort} onChange={(v) => setSort(v as Sort)} active={false} options={[["newest", "Newest first"], ["oldest", "Oldest first"], ["name", "Name A to Z"]]} />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <FilterSelect label="Payment" value={filters.payment} onChange={(v) => setFilter("payment", v as Filters["payment"])} options={[["all", "All payments"], ["paid", `Paid (${stats.paid})`], ["walk_in", `Walk-in (${stats.walkIns})`], ["pending", `Awaiting payment (${stats.pending})`]]} />
                <FilterSelect label="Ticket" value={filters.ticket} onChange={(v) => setFilter("ticket", v)} options={[["all", "All tickets"], ...ticketIds.map((id) => [id, `${ticketName(id)} (${stats.perTicket[id] ?? 0})`] as [string, string])]} />
                <FilterSelect label="Role" value={filters.role} onChange={(v) => setFilter("role", v)} options={[["all", "All roles"], ...roles.map((r) => [r, roleLabel(r)] as [string, string])]} />
                <FilterSelect label="Check-in" value={filters.checkin} onChange={(v) => setFilter("checkin", v as Filters["checkin"])} options={[["all", "Any check-in"], ["in", "Checked in"], ["out", "Not checked in"]]} />
                <button
                  type="button"
                  onClick={() => setFilter("letter", !filters.letter)}
                  aria-pressed={filters.letter}
                  className={cx(
                    "min-h-11 rounded-md border px-3.5 text-sm transition-colors duration-150",
                    filters.letter ? "border-blue bg-subtle font-semibold text-blue" : "border-line-strong bg-surface text-ink-2 hover:bg-subtle active:bg-line"
                  )}
                >
                  Needs invitation letter
                </button>
                {activeFilters && (
                  <Button variant="ghost" size="sm" onClick={() => { setFilters(NO_FILTERS); setPage(0); }}>
                    Clear filters
                  </Button>
                )}
                <p className="ml-auto text-sm text-ink-3" aria-live="polite">
                  {filtered.length} {filtered.length === 1 ? "person" : "people"}
                  {lastUpdated && <span className="hidden sm:inline"> · updated {relativeTime(lastUpdated.toISOString())}</span>}
                </p>
              </div>
            </div>

            {filtered.length === 0 ? (
              activeFilters ? (
                <EmptyState
                  title="No one matches these filters"
                  body="Try a different search, or clear the filters to see everyone."
                  action={<Button variant="outline" onClick={() => { setFilters(NO_FILTERS); setPage(0); }}>Clear filters</Button>}
                />
              ) : (
                <EmptyState
                  title="No registrations yet"
                  body="People who register on the form show up here within a few seconds. You can also add someone at the desk."
                  action={<Button variant="outline" onClick={() => setWalkInOpen(true)}>Add walk-in</Button>}
                />
              )
            ) : (
              <>
                {/* Phones: stacked list */}
                <ul className="divide-y divide-line md:hidden">
                  {pageRows.map((a) => (
                    <li key={a.id} className="space-y-3 p-4">
                      <div className="flex items-center gap-3">
                        <Avatar name={a.full_name} />
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-ink">{a.full_name}</p>
                          <p className="truncate text-sm text-ink-3">{a.email}</p>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <PaymentBadge status={a.payment_status} source={a.source} />
                        <StatusPill checkedIn={a.checked_in} />
                        {a.role !== "delegate" && <RolePill role={a.role} />}
                      </div>
                      <p className="text-sm text-ink-3">
                        {[ticketName(a.ticket_type), money(a.amount_cents, a.currency), relativeTime(a.created_at)].filter(Boolean).join(" · ")}
                      </p>
                      <RowActions a={a} busy={!!rowBusy[a.id]} message={rowMessage[a.id]} onToggle={() => handleToggleCheckIn(a.id, !a.checked_in)} onDetails={() => setSelectedId(a.id)} />
                    </li>
                  ))}
                </ul>

                {/* Wider screens: table */}
                <div className="hidden overflow-x-auto md:block">
                  <table className="w-full text-sm">
                    <thead className="bg-subtle text-left text-xs font-semibold uppercase tracking-wider text-ink-3">
                      <tr>
                        <th scope="col" className="px-4 py-3">Attendee</th>
                        <th scope="col" className="hidden px-4 py-3 @6xl:table-cell">Organisation</th>
                        <th scope="col" className="px-4 py-3">Ticket and payment</th>
                        <th scope="col" className="hidden px-4 py-3 @5xl:table-cell">Registered</th>
                        <th scope="col" className="px-4 py-3">Check-in</th>
                        <th scope="col" className="px-4 py-3 text-right">
                          <span className="sr-only">Actions</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {pageRows.map((a) => (
                        <tr
                          key={a.id}
                          onClick={() => setSelectedId(a.id)}
                          className="cursor-pointer border-t border-line align-middle transition-colors duration-150 hover:bg-canvas"
                        >
                          <td className="px-4 py-3">
                            <div className="flex min-w-0 items-center gap-3">
                              <Avatar name={a.full_name} />
                              <div className="min-w-0">
                                <div className="max-w-56 truncate font-semibold text-ink">{a.full_name}</div>
                                <div className="max-w-56 truncate text-ink-3">{a.email}</div>
                              </div>
                            </div>
                          </td>
                          <td className="hidden px-4 py-3 @6xl:table-cell">
                            <div className={cx("max-w-52 truncate", a.organization ? "text-ink" : "text-ink-3")}>{a.organization ?? "Not given"}</div>
                            <div className="max-w-52 truncate text-ink-3">{[a.job_title, a.organization_country].filter(Boolean).join(" · ")}</div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap items-center gap-2">
                              <PaymentBadge status={a.payment_status} source={a.source} />
                              {a.role !== "delegate" && <RolePill role={a.role} />}
                              {a.needs_invitation_letter && <span className="rounded-sm border border-line px-1.5 py-0.5 text-xs font-semibold text-ink-2">Letter</span>}
                            </div>
                            <div className="mt-1 text-ink-3">
                              {[ticketName(a.ticket_type), money(a.amount_cents, a.currency)].filter(Boolean).join(" · ") || "No ticket"}
                            </div>
                          </td>
                          <td className="hidden whitespace-nowrap px-4 py-3 text-ink-3 @5xl:table-cell" title={new Date(a.created_at).toLocaleString()}>
                            {relativeTime(a.created_at)}
                          </td>
                          <td className="px-4 py-3">
                            <StatusPill checkedIn={a.checked_in} />
                          </td>
                          <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                            <RowActions a={a} busy={!!rowBusy[a.id]} message={rowMessage[a.id]} onToggle={() => handleToggleCheckIn(a.id, !a.checked_in)} onDetails={() => setSelectedId(a.id)} align="end" />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {filtered.length > PAGE_SIZE && (
              <nav aria-label="Pages" className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3 text-sm text-ink-3">
                <span>
                  {currentPage * PAGE_SIZE + 1} to {Math.min((currentPage + 1) * PAGE_SIZE, filtered.length)} of {filtered.length}
                </span>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>
                    Previous
                  </Button>
                  <Button variant="outline" size="sm" disabled={currentPage >= pageCount - 1} onClick={() => setPage(currentPage + 1)}>
                    Next
                  </Button>
                </div>
              </nav>
            )}
          </Card>
        </>
      )}

      {selected && (
        <AttendeeDrawer
          attendee={selected}
          ticketName={ticketName(selected.ticket_type)}
          busy={Boolean(rowBusy[selected.id])}
          message={rowMessage[selected.id] ?? ""}
          onClose={() => setSelectedId(null)}
          onResend={() => handleResend(selected.id)}
          onToggleCheckIn={() => handleToggleCheckIn(selected.id, !selected.checked_in)}
          onPassport={() => handleViewPassport(selected.id)}
          onDelete={() => handleDelete(selected)}
        />
      )}
    </AdminPage>
  );
}

function RowActions({
  a,
  busy,
  message,
  onToggle,
  onDetails,
  align = "start",
}: {
  a: Attendee;
  busy: boolean;
  message?: string;
  onToggle: () => void;
  onDetails: () => void;
  align?: "start" | "end";
}) {
  return (
    <div className={cx("space-y-1", align === "end" && "text-right")}>
      <div className={cx("flex gap-2 whitespace-nowrap", align === "end" && "justify-end")}>
        <Button variant="outline" size="sm" loading={busy} onClick={onToggle} aria-label={`${a.checked_in ? "Undo check-in for" : "Check in"} ${a.full_name}`}>
          {a.checked_in ? "Undo check-in" : "Check in"}
        </Button>
        <Button variant="secondary" size="sm" onClick={onDetails} aria-label={`Details for ${a.full_name}`}>
          Details
        </Button>
      </div>
      {message && (
        <p role="status" className="text-xs text-ink-3">
          {message}
        </p>
      )}
    </div>
  );
}

function ExportMenu({ disabled, options }: { disabled: boolean; options: { label: string; count: number; run: () => void }[] }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    wrap.current?.querySelector<HTMLButtonElement>("[data-menu-item]")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        trigger.current?.focus();
      }
    };
    const onDown = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [open]);

  return (
    <div ref={wrap} className="relative">
      <Button ref={trigger} variant="outline" onClick={() => setOpen((o) => !o)} disabled={disabled} aria-expanded={open} aria-controls="export-menu">
        <IconDownload /> Export CSV
      </Button>
      {open && (
        <div
          id="export-menu"
          className="absolute right-0 z-20 mt-2 w-72 max-w-[calc(100vw-2rem)] rounded-lg border border-line bg-surface p-1.5 transition-[opacity,translate] duration-200 starting:-translate-y-1 starting:opacity-0"
        >
          {options.map((o) => (
            <button
              key={o.label}
              type="button"
              data-menu-item
              onClick={() => {
                o.run();
                setOpen(false);
                trigger.current?.focus();
              }}
              className="flex min-h-11 w-full items-center justify-between rounded-md px-3 text-left text-sm text-ink transition-colors duration-150 hover:bg-subtle active:bg-line"
            >
              {o.label} <span className="text-ink-3">{o.count}</span>
            </button>
          ))}
          <p className="px-3 pb-1 pt-1.5 text-xs text-ink-3">All details. Opens in Excel or Google Sheets.</p>
        </div>
      )}
    </div>
  );
}

function Kpi({
  label,
  value,
  sub,
  alert,
  onClick,
}: {
  label: string;
  value: string | number;
  sub: string;
  alert?: boolean;
  onClick?: () => void;
}) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      {...(onClick ? { type: "button" as const, onClick } : {})}
      className={cx(
        "rounded-lg border border-line bg-surface p-4 text-left",
        onClick && "cursor-pointer transition-colors duration-150 hover:border-ink-3 hover:bg-canvas active:bg-subtle"
      )}
    >
      <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-ink-3">
        {alert && <span aria-hidden="true" className="h-2 w-2 rounded-full bg-danger" />}
        {label}
      </div>
      <div className="mt-1 font-display text-2xl font-bold text-blue sm:text-3xl">{typeof value === "number" ? value.toLocaleString() : value}</div>
      <div className={cx("mt-0.5 text-sm text-ink-3", onClick && "underline decoration-line-strong underline-offset-2")}>{sub}</div>
    </Tag>
  );
}

function Breakdown({ title, rows, total }: { title: string; rows: [string, number][]; total: number }) {
  return (
    <Card className="p-4">
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-ink-3">{title}</h2>
      {rows.length === 0 ? (
        <p className="text-sm text-ink-3">Nobody has answered this yet.</p>
      ) : (
        <ul className="space-y-2.5">
          {rows.map(([label, n]) => (
            <li key={label}>
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="truncate text-ink">{label}</span>
                <span className="shrink-0 font-semibold text-ink">{n}</span>
              </div>
              <div className="mt-1 h-1.5 rounded-sm bg-subtle">
                <div className="h-full rounded-sm bg-gold" style={{ width: `${Math.max(4, (n / total) * 100)}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
  active = value !== "all",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: [string, string][];
  active?: boolean;
}) {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cx(
        "min-h-11 max-w-full rounded-md border bg-surface pl-3 pr-9 text-sm transition-[border-color,box-shadow,outline-color] duration-150 hover:border-ink-3 focus:border-blue focus:outline-none focus:ring-1 focus:ring-inset focus:ring-blue",
        active ? "border-blue font-semibold text-blue" : "border-line-strong text-ink-2"
      )}
    >
      {options.map(([v, l]) => (
        <option key={v} value={v}>{l}</option>
      ))}
    </select>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <LoadingLabel>Loading registrations</LoadingLabel>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        {Array.from({ length: 6 }, (_, i) => (
          <Card key={i} className="space-y-2 p-4">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-8 w-16" />
            <Skeleton className="h-3 w-24" />
          </Card>
        ))}
      </div>
      <Card className="overflow-hidden">
        <div className="space-y-3 border-b border-line p-4">
          <Skeleton className="h-11 w-full rounded-md" />
          <div className="flex gap-2">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-11 w-32 rounded-md" />
            ))}
          </div>
        </div>
        {Array.from({ length: 6 }, (_, i) => (
          <SkeletonRow key={i} />
        ))}
      </Card>
    </div>
  );
}

function SkeletonRow(): ReactNode {
  return (
    <div className="flex items-center gap-3 border-t border-line p-4 first:border-t-0">
      <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-3 w-56 max-w-full" />
      </div>
      <Skeleton className="hidden h-6 w-24 md:block" />
      <Skeleton className="hidden h-9 w-40 rounded-md md:block" />
    </div>
  );
}
