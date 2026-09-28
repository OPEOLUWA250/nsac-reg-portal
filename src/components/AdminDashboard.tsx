"use client";

import { useEffect, useMemo, useState } from "react";
import StaffGate, { useStaffCode } from "@/components/StaffGate";
import TicketManager, { type TicketCounts } from "@/components/TicketManager";
import { Button, Card, Kicker, RolePill, StatusPill } from "@/components/ui";
import { ATTENDEE_ROLES, type Attendee } from "@/lib/types";

const POLL_INTERVAL_MS = 20_000;

type StatusFilter = "all" | "checked_in" | "not_checked_in";

interface RegisterForm {
  fullName: string;
  email: string;
  role: string;
  organization: string;
  phone: string;
}

const EMPTY_FORM: RegisterForm = {
  fullName: "",
  email: "",
  role: "attendee",
  organization: "",
  phone: "",
};

export default function AdminDashboard() {
  const { staffCode, saveStaffCode } = useStaffCode();
  const [attendees, setAttendees] = useState<Attendee[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const [rowBusy, setRowBusy] = useState<Record<string, boolean>>({});
  const [rowMessage, setRowMessage] = useState<Record<string, string>>({});

  const [showRegisterForm, setShowRegisterForm] = useState(false);
  const [form, setForm] = useState<RegisterForm>(EMPTY_FORM);
  const [registering, setRegistering] = useState(false);
  const [registerError, setRegisterError] = useState("");

  const [showTickets, setShowTickets] = useState(false);

  async function apiCall(path: string, options: RequestInit = {}) {
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
  }

  async function loadAttendees() {
    setRefreshing(true);
    try {
      const { attendees } = await apiCall("/api/admin/attendees");
      setAttendees(attendees);
      setLoadError("");
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load attendees");
    } finally {
      setRefreshing(false);
    }
  }

  useEffect(() => {
    if (!staffCode) return;
    loadAttendees();
    const interval = setInterval(loadAttendees, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [staffCode]);

  const roles = useMemo(() => {
    if (!attendees) return [];
    return Array.from(new Set(attendees.map((a) => a.role))).sort();
  }, [attendees]);

  const filtered = useMemo(() => {
    if (!attendees) return [];
    const q = search.trim().toLowerCase();
    return attendees.filter((a) => {
      if (roleFilter !== "all" && a.role !== roleFilter) return false;
      if (statusFilter === "checked_in" && !a.checked_in) return false;
      if (statusFilter === "not_checked_in" && a.checked_in) return false;
      if (
        q &&
        !a.full_name.toLowerCase().includes(q) &&
        !a.email.toLowerCase().includes(q) &&
        !(a.organization ?? "").toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });
  }, [attendees, search, roleFilter, statusFilter]);

  const stats = useMemo(() => {
    if (!attendees) return null;
    const total = attendees.length;
    const checkedIn = attendees.filter((a) => a.checked_in).length;
    const byRole = roles.map((role) => {
      const roleAttendees = attendees.filter((a) => a.role === role);
      return {
        role,
        total: roleAttendees.length,
        checkedIn: roleAttendees.filter((a) => a.checked_in).length,
      };
    });
    return { total, checkedIn, byRole };
  }, [attendees, roles]);

  // Registrations per ticket, shown in the Tickets & prices panel.
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

  async function handleResend(id: string) {
    setRowBusy((s) => ({ ...s, [id]: true }));
    setRowMessage((s) => ({ ...s, [id]: "" }));
    try {
      await apiCall("/api/admin/resend-qr", {
        method: "POST",
        body: JSON.stringify({ id }),
      });
      setRowMessage((s) => ({ ...s, [id]: "QR email sent" }));
      loadAttendees();
    } catch (err) {
      setRowMessage((s) => ({
        ...s,
        [id]: err instanceof Error ? err.message : "Failed to resend",
      }));
    } finally {
      setRowBusy((s) => ({ ...s, [id]: false }));
    }
  }

  async function handleToggleCheckIn(id: string, checkedIn: boolean) {
    setRowBusy((s) => ({ ...s, [id]: true }));
    setRowMessage((s) => ({ ...s, [id]: "" }));
    try {
      const { attendee } = await apiCall("/api/admin/toggle-checkin", {
        method: "POST",
        body: JSON.stringify({ id, checkedIn }),
      });
      setAttendees((prev) =>
        prev ? prev.map((a) => (a.id === id ? attendee : a)) : prev
      );
    } catch (err) {
      setRowMessage((s) => ({
        ...s,
        [id]: err instanceof Error ? err.message : "Failed to update",
      }));
    } finally {
      setRowBusy((s) => ({ ...s, [id]: false }));
    }
  }

  async function handleViewPassport(id: string) {
    // Open the tab first (inside the click) so pop-up blockers allow it.
    const tab = window.open("", "_blank");
    try {
      const { url } = await apiCall("/api/admin/passport", {
        method: "POST",
        body: JSON.stringify({ id }),
      });
      if (tab) tab.location.href = url;
      else window.location.href = url;
    } catch (err) {
      tab?.close();
      setRowMessage((s) => ({
        ...s,
        [id]: err instanceof Error ? err.message : "Could not open passport",
      }));
    }
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setRegistering(true);
    setRegisterError("");
    try {
      await apiCall("/api/admin/register", {
        method: "POST",
        body: JSON.stringify({
          fullName: form.fullName,
          email: form.email,
          role: form.role,
          organization: form.organization,
          phone: form.phone,
        }),
      });
      setForm(EMPTY_FORM);
      setShowRegisterForm(false);
      loadAttendees();
    } catch (err) {
      setRegisterError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setRegistering(false);
    }
  }

  function exportCsv() {
    const header = [
      "Name",
      "Email",
      "Role",
      "Organization",
      "Phone",
      "Job Title",
      "Nationality",
      "Country of Residence",
      "Organization Location",
      "Professional Category",
      "Job Function",
      "Invitation Letter",
      "Passport Uploaded",
      "Food Allergies",
      "Ticket",
      "Payment",
      "Amount",
      "VAT Number",
      "Invoice ID",
      "Opt-in Organizer",
      "Opt-in Sponsors",
      "Source",
      "Registered At",
      "Checked In",
      "Checked In At",
      "Station",
      "Badge Prints",
    ];
    const rows = filtered.map((a) => [
      a.full_name,
      a.email,
      a.role,
      a.organization ?? "",
      a.phone ?? "",
      a.job_title ?? "",
      a.nationality ?? "",
      a.residence_country ?? "",
      a.organization_country ?? "",
      a.professional_category ?? "",
      a.job_function ?? "",
      a.needs_invitation_letter == null ? "" : a.needs_invitation_letter ? "yes" : "no",
      a.passport_path ? "yes" : "no",
      a.food_allergies ?? "",
      a.ticket_type ?? "",
      paymentLabel(a.payment_status),
      a.amount_cents != null ? `${(a.amount_cents / 100).toFixed(2)} ${(a.currency ?? "").toUpperCase()}` : "",
      a.vat_number ?? "",
      a.invoice_reference ?? "",
      a.opt_in_organizer ? "yes" : "no",
      a.opt_in_sponsors ? "yes" : "no",
      a.source ?? "",
      a.created_at ?? "",
      a.checked_in ? "yes" : "no",
      a.checked_in_at ?? "",
      a.checked_in_station ?? "",
      String(a.badge_print_count),
    ]);
    const csv = [header, ...rows]
      .map((row) => row.map(csvCell).join(","))
      .join("\n");
    // The BOM makes Excel read the file as UTF-8 (accents like "Côte d'Ivoire").
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `attendees-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (!staffCode) {
    return <StaffGate onSubmit={saveStaffCode} />;
  }

  return (
    <main className="flex-1 p-6 sm:p-10">
      <div className="max-w-6xl mx-auto space-y-7">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <Kicker>Event Control</Kicker>
            <h1 className="font-display text-2xl text-navy">Admin Dashboard</h1>
          </div>
          <div className="flex flex-wrap justify-end gap-2.5">
            <Button variant="outline" onClick={() => setShowTickets((s) => !s)}>
              {showTickets ? "Hide tickets & prices" : "Tickets & prices"}
            </Button>
            <Button variant="outline" onClick={loadAttendees} disabled={refreshing}>
              {refreshing ? "Refreshing..." : "Refresh"}
            </Button>
          </div>
        </div>

        {loadError && <p className="text-red-600 text-sm">{loadError}</p>}

        {showTickets && <TicketManager apiCall={apiCall} counts={ticketCounts} />}

        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <StatCard label="Registered" value={stats.total} />
            <StatCard label="Checked in" value={stats.checkedIn} accent />
            <StatCard
              label="Check-in rate"
              value={
                stats.total ? `${Math.round((stats.checkedIn / stats.total) * 100)}%` : "—"
              }
            />
            <StatCard label="Not checked in" value={stats.total - stats.checkedIn} />
          </div>
        )}

        {stats && stats.byRole.length > 0 && (
          <div className="flex flex-wrap items-center gap-3">
            {stats.byRole.map(({ role, total, checkedIn }) => (
              <div key={role} className="flex items-center gap-2">
                <RolePill role={role} />
                <span className="text-xs text-navy/50 font-medium">
                  {checkedIn}/{total}
                </span>
              </div>
            ))}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2.5">
          <input
            className="rounded-lg border border-navy/15 px-4 py-2.5 flex-1 min-w-[200px] text-navy placeholder:text-navy/35 outline-none focus:border-gold focus:ring-2 focus:ring-gold/25"
            placeholder="Search name, email, organization..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            className="rounded-lg border border-navy/15 px-3 py-2.5 text-navy outline-none focus:border-gold"
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
          >
            <option value="all">All roles</option>
            {roles.map((role) => (
              <option key={role} value={role}>
                {role}
              </option>
            ))}
          </select>
          <select
            className="rounded-lg border border-navy/15 px-3 py-2.5 text-navy outline-none focus:border-gold"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
          >
            <option value="all">All statuses</option>
            <option value="checked_in">Checked in</option>
            <option value="not_checked_in">Not checked in</option>
          </select>
          <Button variant="outline" onClick={exportCsv}>
            Export CSV
          </Button>
          <Button variant="gold" onClick={() => setShowRegisterForm((s) => !s)}>
            {showRegisterForm ? "Cancel" : "+ Walk-in registration"}
          </Button>
        </div>

        {showRegisterForm && (
          <Card className="p-6">
            <form
              onSubmit={handleRegister}
              className="grid grid-cols-1 sm:grid-cols-2 gap-3"
            >
              <input
                required
                className="rounded-lg border border-navy/15 px-4 py-2.5 text-navy placeholder:text-navy/35 outline-none focus:border-gold focus:ring-2 focus:ring-gold/25"
                placeholder="Full name"
                value={form.fullName}
                onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))}
              />
              <input
                required
                type="email"
                className="rounded-lg border border-navy/15 px-4 py-2.5 text-navy placeholder:text-navy/35 outline-none focus:border-gold focus:ring-2 focus:ring-gold/25"
                placeholder="Email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              />
              <select
                aria-label="Role"
                className="rounded-lg border border-navy/15 px-4 py-2.5 text-navy outline-none focus:border-gold focus:ring-2 focus:ring-gold/25"
                value={form.role}
                onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
              >
                {ATTENDEE_ROLES.map((role) => (
                  <option key={role} value={role}>
                    {role}
                  </option>
                ))}
              </select>
              <input
                className="rounded-lg border border-navy/15 px-4 py-2.5 text-navy placeholder:text-navy/35 outline-none focus:border-gold focus:ring-2 focus:ring-gold/25"
                placeholder="Organization"
                value={form.organization}
                onChange={(e) => setForm((f) => ({ ...f, organization: e.target.value }))}
              />
              <input
                className="rounded-lg border border-navy/15 px-4 py-2.5 text-navy placeholder:text-navy/35 outline-none focus:border-gold focus:ring-2 focus:ring-gold/25"
                placeholder="Phone"
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              />
              <div className="sm:col-span-2 flex items-center gap-3">
                <Button type="submit" variant="navy" disabled={registering}>
                  {registering ? "Registering..." : "Register & send QR"}
                </Button>
                {registerError && (
                  <p className="text-red-600 text-sm">{registerError}</p>
                )}
              </div>
            </form>
          </Card>
        )}

        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead
              className="text-left text-white"
              style={{
                background:
                  "linear-gradient(120deg, var(--navy) 0%, var(--blue-2) 100%)",
              }}
            >
              <tr>
                <th className="p-3.5 text-xs font-semibold uppercase tracking-wider">Name</th>
                <th className="p-3.5 text-xs font-semibold uppercase tracking-wider">Role</th>
                <th className="p-3.5 text-xs font-semibold uppercase tracking-wider">
                  Organization
                </th>
                <th className="p-3.5 text-xs font-semibold uppercase tracking-wider">Status</th>
                <th className="p-3.5 text-xs font-semibold uppercase tracking-wider">Payment · QR</th>
                <th className="p-3.5 text-xs font-semibold uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody>
              {attendees === null && (
                <tr>
                  <td className="p-4 text-navy/50" colSpan={6}>
                    Loading...
                  </td>
                </tr>
              )}
              {attendees !== null && filtered.length === 0 && (
                <tr>
                  <td className="p-4 text-navy/50" colSpan={6}>
                    No attendees match.
                  </td>
                </tr>
              )}
              {filtered.map((a) => (
                <tr
                  key={a.id}
                  className="border-t border-navy/8 align-top hover:bg-navy/[0.02] transition-colors"
                >
                  <td className="p-3.5">
                    <div className="font-medium text-navy">{a.full_name}</div>
                    <div className="text-navy/50 text-xs">{a.email}</div>
                  </td>
                  <td className="p-3.5">
                    <RolePill role={a.role} />
                  </td>
                  <td className="p-3.5 text-navy/70">{a.organization ?? "—"}</td>
                  <td className="p-3.5">
                    <StatusPill checkedIn={a.checked_in} />
                    {a.checked_in && a.checked_in_at && (
                      <div className="text-[11px] text-navy/40 mt-1">
                        {new Date(a.checked_in_at).toLocaleString()}
                        {a.checked_in_station && ` · ${a.checked_in_station}`}
                      </div>
                    )}
                  </td>
                  <td className="p-3.5 text-navy/70">
                    <PaymentPill status={a.payment_status} />
                    <div className="text-[11px] text-navy/45 mt-1">
                      QR {a.qr_email_sent_at ? "sent" : "not sent"}
                      {a.ticket_type && ` · ${a.ticket_type.replace(/_/g, " ")}`}
                    </div>
                  </td>
                  <td className="p-3.5 space-y-1.5">
                    <div className="flex flex-wrap gap-2">
                      <button
                        className="rounded-full border border-navy/20 px-3 py-1 text-xs font-medium text-navy hover:bg-navy/5 disabled:opacity-50 transition-colors"
                        disabled={rowBusy[a.id]}
                        onClick={() => handleResend(a.id)}
                      >
                        Resend QR
                      </button>
                      <button
                        className="rounded-full border border-navy/20 px-3 py-1 text-xs font-medium text-navy hover:bg-navy/5 disabled:opacity-50 transition-colors"
                        disabled={rowBusy[a.id]}
                        onClick={() => handleToggleCheckIn(a.id, !a.checked_in)}
                      >
                        {a.checked_in ? "Undo check-in" : "Mark checked in"}
                      </button>
                      {a.passport_path && (
                        <button
                          className="rounded-full border border-navy/20 px-3 py-1 text-xs font-medium text-navy hover:bg-navy/5 disabled:opacity-50 transition-colors"
                          disabled={rowBusy[a.id]}
                          onClick={() => handleViewPassport(a.id)}
                        >
                          Passport
                        </button>
                      )}
                    </div>
                    {rowMessage[a.id] && (
                      <div className="text-[11px] text-navy/45">{rowMessage[a.id]}</div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    </main>
  );
}

function StatCard({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string | number;
  accent?: boolean;
}) {
  return (
    <Card className="p-5 relative overflow-hidden">
      {accent && (
        <span className="absolute top-0 left-0 h-1 w-full bg-gold" />
      )}
      <div className="text-[11px] font-semibold uppercase tracking-wider text-navy/45">
        {label}
      </div>
      <div className="font-display text-3xl text-navy mt-1">{value}</div>
    </Card>
  );
}

function paymentLabel(status: Attendee["payment_status"]): string {
  if (status === "pending") return "pending";
  if (status === "paid") return "paid";
  if (status === "not_required") return "not required";
  return "jotform";
}

function PaymentPill({ status }: { status: Attendee["payment_status"] }) {
  const pending = status === "pending";
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider whitespace-nowrap ${
        pending ? "border-red-300 bg-red-50 text-red-700" : "border-navy/15 text-navy/60"
      }`}
    >
      {paymentLabel(status)}
    </span>
  );
}

// Quotes a CSV cell, and stops Excel from running cells that start with
// =, +, - or @ as formulas (a registrant could type one into the form).
function csvCell(value: unknown): string {
  let text = String(value ?? "");
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}
