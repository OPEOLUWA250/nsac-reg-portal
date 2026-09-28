"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import StaffGate, { useStaffCode } from "@/components/StaffGate";
import TicketManager, { type TicketCounts } from "@/components/TicketManager";
import AttendeeDrawer, { Avatar, PaymentBadge } from "@/components/AttendeeDrawer";
import { Button, Card, Kicker, RolePill, StatusPill } from "@/components/ui";
import { buildAttendeeCsv, categoryLabel, money, relativeTime } from "@/lib/admin-format";
import { EVENT_INFO } from "@/lib/event-info";
import { ATTENDEE_ROLES, type Attendee } from "@/lib/types";
import type { Ticket } from "@/lib/tickets";

const POLL_INTERVAL_MS = 20_000;
const PAGE_SIZE = 25;

type Sort = "newest" | "oldest" | "name";

interface Filters {
  search: string;
  payment: "all" | "paid" | "pending" | "not_required" | "legacy";
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

const EMPTY_FORM: RegisterForm = { fullName: "", email: "", role: "attendee", organization: "", phone: "" };

type Panel = "none" | "tickets" | "walkin";

export default function AdminDashboard() {
  const { staffCode, saveStaffCode } = useStaffCode();
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

  const [panel, setPanel] = useState<Panel>("none");
  const [form, setForm] = useState<RegisterForm>(EMPTY_FORM);
  const [registering, setRegistering] = useState(false);
  const [registerError, setRegisterError] = useState("");
  const [exportOpen, setExportOpen] = useState(false);

  const apiCall = useCallback(
    async (path: string, options: RequestInit = {}) => {
      const res = await fetch(path, {
        ...options,
        headers: {
          "Content-Type": "application/json",
          "x-staff-code": staffCode ?? "",
          ...options.headers,
        },
      });
      const json = await res.json();
      if (!res.ok) {
        // body carries extra detail, e.g. per-field errors from the tickets API.
        throw Object.assign(new Error(json.error ?? `Request failed (${res.status})`), { body: json });
      }
      return json;
    },
    [staffCode]
  );

  const loadAttendees = useCallback(async () => {
    setRefreshing(true);
    try {
      const { attendees } = await apiCall("/api/admin/attendees");
      setAttendees(attendees);
      setLoadError("");
      setLastUpdated(new Date());
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load attendees");
    } finally {
      setRefreshing(false);
    }
  }, [apiCall]);

  useEffect(() => {
    if (!staffCode) return;
    let cancelled = false;
    const load = () => {
      if (!cancelled) loadAttendees();
    };
    const first = setTimeout(load, 0);
    const interval = setInterval(load, POLL_INTERVAL_MS);
    // Ticket names for labels (the prices panel manages them).
    apiCall("/api/admin/tickets").then(
      (json) => !cancelled && setTickets(json.tickets as Ticket[]),
      () => {}
    );
    return () => {
      cancelled = true;
      clearTimeout(first);
      clearInterval(interval);
    };
  }, [staffCode, apiCall, loadAttendees]);

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
      checkedIn: list.filter((a) => a.checked_in).length,
      letters: list.filter((a) => a.needs_invitation_letter).length,
      lettersNoPassport: list.filter((a) => a.needs_invitation_letter && !a.passport_path).length,
      byTicket: count((a) => (a.ticket_type ? ticketName(a.ticket_type) : null)),
      byCountry: count((a) => a.nationality),
      byCategory: count((a) => categoryLabel(a.professional_category)),
    };
  }, [attendees, ticketName]);

  const ticketCounts = useMemo(() => {
    const counts: Record<string, TicketCounts> = {};
    for (const a of attendees ?? []) {
      if (!a.ticket_type) continue;
      const c = (counts[a.ticket_type] ??= { paid: 0, pending: 0 });
      if (a.payment_status === "paid") c.paid++;
      else if (a.payment_status === "pending") c.pending++;
    }
    return counts;
  }, [attendees]);

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
      if (filters.payment === "legacy" ? a.payment_status != null : filters.payment !== "all" && a.payment_status !== filters.payment) return false;
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
      return "QR email sent ✓";
    });

  const handleToggleCheckIn = (id: string, checkedIn: boolean) =>
    withRow(id, async () => {
      const { attendee } = await apiCall("/api/admin/toggle-checkin", {
        method: "POST",
        body: JSON.stringify({ id, checkedIn }),
      });
      setAttendees((prev) => (prev ? prev.map((a) => (a.id === id ? attendee : a)) : prev));
      return checkedIn ? "Checked in ✓" : "Check-in undone";
    });

  function handleViewPassport(id: string) {
    // Open the tab first (inside the click) so pop-up blockers allow it.
    const tab = window.open("", "_blank");
    withRow(id, async () => {
      try {
        const { url } = await apiCall("/api/admin/passport", { method: "POST", body: JSON.stringify({ id }) });
        if (tab) tab.location.href = url;
        else window.location.href = url;
      } catch (err) {
        tab?.close();
        throw err;
      }
    });
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setRegistering(true);
    setRegisterError("");
    try {
      await apiCall("/api/admin/register", { method: "POST", body: JSON.stringify(form) });
      setForm(EMPTY_FORM);
      setPanel("none");
      loadAttendees();
    } catch (err) {
      setRegisterError(err instanceof Error ? err.message : "Registration failed");
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
    setExportOpen(false);
  }

  if (!staffCode) {
    return <StaffGate onSubmit={saveStaffCode} />;
  }

  const selected = attendees?.find((a) => a.id === selectedId) ?? null;
  const checkInRate = stats.total ? Math.round((stats.checkedIn / stats.total) * 100) : 0;

  return (
    <main className="flex-1 px-4 py-6 sm:px-8 sm:py-10 bg-[#F4F6FA]">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Title + actions */}
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="space-y-1">
            <Kicker>Event control</Kicker>
            <h1 className="font-display text-3xl text-navy">Registrations</h1>
            <p className="text-sm text-navy/55">
              {EVENT_INFO.name.en} · {EVENT_INFO.date.en} · {EVENT_INFO.place.en}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={() => setPanel((p) => (p === "tickets" ? "none" : "tickets"))}>
              {panel === "tickets" ? "Close prices" : "Tickets & prices"}
            </Button>
            <Button variant="outline" onClick={() => setPanel((p) => (p === "walkin" ? "none" : "walkin"))}>
              {panel === "walkin" ? "Cancel walk-in" : "+ Walk-in"}
            </Button>
            <div className="relative">
              <Button variant="navy" onClick={() => setExportOpen((o) => !o)} disabled={!attendees?.length}>
                <DownloadIcon /> Export CSV
              </Button>
              {exportOpen && (
                <div className="absolute right-0 z-20 mt-2 w-64 rounded-xl border border-navy/10 bg-white p-1.5 shadow-xl">
                  <MenuItem onClick={() => exportCsv(filtered, activeFilters ? "filtered" : "all")}>
                    Current view <span className="text-navy/45">({filtered.length})</span>
                  </MenuItem>
                  <MenuItem onClick={() => exportCsv(attendees ?? [], "all")}>
                    Everyone <span className="text-navy/45">({attendees?.length ?? 0})</span>
                  </MenuItem>
                  <MenuItem onClick={() => exportCsv((attendees ?? []).filter((a) => a.needs_invitation_letter), "invitation-letters")}>
                    Invitation letters <span className="text-navy/45">({stats.letters})</span>
                  </MenuItem>
                  <p className="px-3 pt-1.5 pb-1 text-[11px] text-navy/45">All details, opens in Excel / Google Sheets.</p>
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={loadAttendees}
              disabled={refreshing}
              title="Refresh"
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-navy/20 text-navy hover:bg-navy/5 disabled:opacity-50"
            >
              <svg viewBox="0 0 24 24" className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7" /></svg>
            </button>
          </div>
        </div>

        {loadError && <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{loadError}</p>}

        {/* KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
          <Kpi label="Registrations" value={stats.total} sub={stats.newToday ? `+${stats.newToday} in last 24 h` : "No new in 24 h"} />
          <Kpi label="Paid" value={stats.paid} sub={stats.total ? `${Math.round((stats.paid / stats.total) * 100)}% of all` : "—"} tone="good" />
          <Kpi label="Revenue" value={money(stats.revenueCents, stats.currency) || "€0"} sub="Paid tickets" tone="gold" />
          <Kpi
            label="Awaiting payment"
            value={stats.pending}
            sub="Started, not paid"
            tone={stats.pending ? "warn" : undefined}
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

        {/* Breakdown */}
        {stats.total > 0 && (
          <div className="grid md:grid-cols-3 gap-3">
            <Breakdown title="By ticket" rows={stats.byTicket} total={stats.total} />
            <Breakdown title="Top nationalities" rows={stats.byCountry} total={stats.total} />
            <Breakdown title="By professional category" rows={stats.byCategory} total={stats.total} />
          </div>
        )}

        {panel === "tickets" && <TicketManager apiCall={apiCall} counts={ticketCounts} />}

        {panel === "walkin" && (
          <Card className="p-6 space-y-4">
            <div>
              <h2 className="font-display text-lg text-navy">Walk-in registration</h2>
              <p className="text-sm text-navy/55">For speakers, staff, guests or people registering at the desk. No payment needed; their QR code is emailed straight away.</p>
            </div>
            <form onSubmit={handleRegister} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              <input required className={INPUT} placeholder="Full name" value={form.fullName} onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))} />
              <input required type="email" className={INPUT} placeholder="Email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
              <select aria-label="Role" className={INPUT} value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}>
                {ATTENDEE_ROLES.map((role) => (
                  <option key={role} value={role}>{role}</option>
                ))}
              </select>
              <input className={INPUT} placeholder="Organisation" value={form.organization} onChange={(e) => setForm((f) => ({ ...f, organization: e.target.value }))} />
              <input className={INPUT} placeholder="Phone" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
              <div className="sm:col-span-2 lg:col-span-5 flex items-center gap-3">
                <Button type="submit" variant="gold" disabled={registering}>{registering ? "Registering..." : "Register & send QR"}</Button>
                {registerError && <p className="text-red-600 text-sm">{registerError}</p>}
              </div>
            </form>
          </Card>
        )}

        {/* Filters + table */}
        <Card className="overflow-hidden">
          <div className="border-b border-navy/8 p-4 space-y-3">
            <div className="flex flex-wrap items-center gap-2.5">
              <div className="relative flex-1 min-w-[220px]">
                <svg viewBox="0 0 24 24" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-navy/35" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
                <input
                  className={`${INPUT} pl-10`}
                  placeholder="Search name, email, organisation, phone, reference…"
                  value={filters.search}
                  onChange={(e) => setFilter("search", e.target.value)}
                />
              </div>
              <select aria-label="Sort" className="rounded-lg border border-navy/15 bg-white px-3.5 py-2.5 text-sm text-navy outline-none focus:border-gold focus:ring-2 focus:ring-gold/25" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
                <option value="name">Name A–Z</option>
              </select>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <FilterSelect label="Payment" value={filters.payment} onChange={(v) => setFilter("payment", v as Filters["payment"])} options={[["all", "All payments"], ["paid", "Paid"], ["pending", "Awaiting payment"], ["not_required", "Not required"], ["legacy", "Jotform"]]} />
              <FilterSelect label="Ticket" value={filters.ticket} onChange={(v) => setFilter("ticket", v)} options={[["all", "All tickets"], ...ticketIds.map((id) => [id, ticketName(id)] as [string, string])]} />
              <FilterSelect label="Role" value={filters.role} onChange={(v) => setFilter("role", v)} options={[["all", "All roles"], ...roles.map((r) => [r, r[0].toUpperCase() + r.slice(1)] as [string, string])]} />
              <FilterSelect label="Check-in" value={filters.checkin} onChange={(v) => setFilter("checkin", v as Filters["checkin"])} options={[["all", "Any check-in"], ["in", "Checked in"], ["out", "Not checked in"]]} />
              <button
                type="button"
                onClick={() => setFilter("letter", !filters.letter)}
                aria-pressed={filters.letter}
                className={`rounded-full border px-3.5 py-2 text-sm transition-colors ${filters.letter ? "border-gold bg-gold/10 font-semibold text-navy" : "border-navy/15 text-navy/70 hover:border-navy/30"}`}
              >
                Needs invitation letter
              </button>
              {activeFilters && (
                <button type="button" onClick={() => { setFilters(NO_FILTERS); setPage(0); }} className="text-sm font-semibold text-navy/55 underline decoration-gold hover:text-navy">
                  Clear filters
                </button>
              )}
              <span className="ml-auto text-sm text-navy/50">
                {filtered.length} {filtered.length === 1 ? "person" : "people"}
                {lastUpdated && <span className="hidden sm:inline"> · updated {relativeTime(lastUpdated.toISOString())}</span>}
              </span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-navy/[0.03] text-left text-[11px] font-semibold uppercase tracking-wider text-navy/50">
                <tr>
                  <th className="px-4 py-3">Attendee</th>
                  <th className="px-4 py-3 hidden md:table-cell">Organisation</th>
                  <th className="px-4 py-3">Ticket & payment</th>
                  <th className="px-4 py-3 hidden lg:table-cell">Registered</th>
                  <th className="px-4 py-3 hidden sm:table-cell">Check-in</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {attendees === null && (
                  <tr><td className="px-4 py-10 text-center text-navy/45" colSpan={6}>Loading registrations…</td></tr>
                )}
                {attendees !== null && filtered.length === 0 && (
                  <tr><td className="px-4 py-10 text-center text-navy/45" colSpan={6}>{activeFilters ? "No one matches these filters." : "No registrations yet."}</td></tr>
                )}
                {pageRows.map((a) => (
                  <tr
                    key={a.id}
                    onClick={() => setSelectedId(a.id)}
                    className="cursor-pointer border-t border-navy/6 align-middle hover:bg-gold/[0.04] transition-colors"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <Avatar name={a.full_name} />
                        <div className="min-w-0">
                          <div className="font-semibold text-navy truncate">{a.full_name}</div>
                          <div className="text-xs text-navy/50 truncate">{a.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <div className="text-navy truncate max-w-[220px]">{a.organization ?? "—"}</div>
                      <div className="text-xs text-navy/50 truncate max-w-[220px]">
                        {[a.job_title, a.organization_country].filter(Boolean).join(" · ")}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <PaymentBadge status={a.payment_status} />
                        {a.role !== "delegate" && <RolePill role={a.role} />}
                      </div>
                      <div className="mt-1 text-xs text-navy/55">
                        {[ticketName(a.ticket_type), money(a.amount_cents, a.currency)].filter(Boolean).join(" · ") || "—"}
                        {a.needs_invitation_letter && <span className="ml-1.5 rounded bg-gold/15 px-1.5 py-0.5 text-[10px] font-semibold text-navy">LETTER</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell text-navy/60 whitespace-nowrap" title={new Date(a.created_at).toLocaleString()}>
                      {relativeTime(a.created_at)}
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell">
                      <StatusPill checkedIn={a.checked_in} />
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        disabled={rowBusy[a.id]}
                        onClick={() => handleToggleCheckIn(a.id, !a.checked_in)}
                        className="rounded-full border border-navy/15 px-3 py-1.5 text-xs font-semibold text-navy hover:bg-navy/5 disabled:opacity-50"
                      >
                        {a.checked_in ? "Undo" : "Check in"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedId(a.id)}
                        className="ml-1.5 rounded-full bg-navy px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-2"
                      >
                        Details
                      </button>
                      {rowMessage[a.id] && <div className="mt-1 text-[11px] text-navy/50">{rowMessage[a.id]}</div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {filtered.length > PAGE_SIZE && (
            <div className="flex items-center justify-between border-t border-navy/8 px-4 py-3 text-sm text-navy/60">
              <span>
                {currentPage * PAGE_SIZE + 1}–{Math.min((currentPage + 1) * PAGE_SIZE, filtered.length)} of {filtered.length}
              </span>
              <div className="flex gap-2">
                <button type="button" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)} className="rounded-full border border-navy/15 px-3.5 py-1.5 font-semibold text-navy disabled:opacity-40">← Previous</button>
                <button type="button" disabled={currentPage >= pageCount - 1} onClick={() => setPage(currentPage + 1)} className="rounded-full border border-navy/15 px-3.5 py-1.5 font-semibold text-navy disabled:opacity-40">Next →</button>
              </div>
            </div>
          )}
        </Card>
      </div>

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
        />
      )}
    </main>
  );
}

const INPUT =
  "w-full rounded-lg border border-navy/15 bg-white px-3.5 py-2.5 text-sm text-navy placeholder:text-navy/35 outline-none focus:border-gold focus:ring-2 focus:ring-gold/25";

function Kpi({
  label,
  value,
  sub,
  tone,
  onClick,
}: {
  label: string;
  value: string | number;
  sub: string;
  tone?: "good" | "gold" | "warn";
  onClick?: () => void;
}) {
  const accent = tone === "good" ? "bg-emerald-500" : tone === "gold" ? "bg-gold" : tone === "warn" ? "bg-red-500" : "bg-navy/15";
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      {...(onClick ? { type: "button" as const, onClick } : {})}
      className={`relative overflow-hidden rounded-2xl border border-navy/10 bg-white p-4 text-left shadow-[0_1px_2px_rgba(10,26,49,0.04)] ${onClick ? "hover:border-gold/60 transition-colors" : ""}`}
    >
      <span className={`absolute left-0 top-0 h-full w-1 ${accent}`} />
      <div className="text-[11px] font-semibold uppercase tracking-wider text-navy/45">{label}</div>
      <div className="mt-1 font-display text-2xl sm:text-3xl text-navy">{typeof value === "number" ? value.toLocaleString() : value}</div>
      <div className="mt-0.5 text-xs text-navy/50">{sub}</div>
    </Tag>
  );
}

function Breakdown({ title, rows, total }: { title: string; rows: [string, number][]; total: number }) {
  return (
    <div className="rounded-2xl border border-navy/10 bg-white p-4">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-navy/45 mb-3">{title}</div>
      {rows.length === 0 ? (
        <p className="text-sm text-navy/40">No data yet</p>
      ) : (
        <ul className="space-y-2.5">
          {rows.map(([label, n]) => (
            <li key={label}>
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="truncate text-navy">{label}</span>
                <span className="shrink-0 font-semibold text-navy">{n}</span>
              </div>
              <div className="mt-1 h-1.5 rounded-full bg-navy/6">
                <div className="h-full rounded-full bg-linear-to-r from-[#03416A] to-gold" style={{ width: `${Math.max(4, (n / total) * 100)}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: [string, string][];
}) {
  const active = value !== "all";
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`rounded-full border px-3.5 py-2 text-sm outline-none focus:ring-2 focus:ring-gold/25 ${active ? "border-gold bg-gold/10 font-semibold text-navy" : "border-navy/15 bg-white text-navy/70"}`}
    >
      {options.map(([v, l]) => (
        <option key={v} value={v}>{l}</option>
      ))}
    </select>
  );
}

function MenuItem({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm text-navy hover:bg-navy/5">
      {children}
    </button>
  );
}

function DownloadIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 4v11m0 0l-4-4m4 4l4-4M5 20h14" /></svg>
  );
}
