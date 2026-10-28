"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAdmin } from "@/components/admin/AdminContext";
import AdminActivitySection from "@/components/admin/AdminActivitySection";
import { BarChart, Breakdown, Kpi, Segmented } from "@/components/admin/Stats";
import { AdminPage, Alert, Button, Card, cx, EmptyState, ErrorState, LoadingLabel, PageHeader, Skeleton } from "@/components/ui";
import { IconRefresh } from "@/components/icons";
import { categoryLabel, jobFunctionLabel, money, relativeTime } from "@/lib/admin-format";
import { bucketByDay, countBy } from "@/lib/analytics";
import { EVENT_INFO } from "@/lib/event-info";
import { roleLabel } from "@/lib/role-style";
import type { Attendee } from "@/lib/types";
import type { Ticket } from "@/lib/tickets";

// /admin/analytics: registrations and revenue over time, tickets, who
// registered and, for super admins, what admins have been doing.

const POLL_INTERVAL_MS = 60_000;

type Range = "30" | "90" | "all";
type Metric = "registrations" | "revenue";
type Audience = "everyone" | "confirmed";

const SOURCE_LABELS: Record<string, string> = { web: "Registration form", walk_in: "Walk-in (added by staff)", jotform: "Jotform" };
const LANGUAGE_LABELS: Record<string, string> = { en: "English", fr: "French" };

// Registered and not left waiting at the payment step.
const isConfirmed = (a: Attendee) => a.payment_status !== "pending";

export default function AnalyticsPanel() {
  const { apiCall, me } = useAdmin();
  const [attendees, setAttendees] = useState<Attendee[] | null>(null);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loadError, setLoadError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  // Bumped by the refresh button so the activity section reloads too.
  const [refreshKey, setRefreshKey] = useState(0);

  const [range, setRange] = useState<Range>("30");
  const [metric, setMetric] = useState<Metric>("registrations");
  const [audience, setAudience] = useState<Audience>("everyone");

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

  const ticketName = useCallback(
    (id: string | null) => {
      if (!id) return "";
      return tickets.find((t) => t.id === id)?.name.en ?? id.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    },
    [tickets]
  );

  const all = useMemo(() => attendees ?? [], [attendees]);
  const audienceList = useMemo(() => (audience === "confirmed" ? all.filter(isConfirmed) : all), [all, audience]);

  // ---------- headline numbers ----------

  const summary = useMemo(() => {
    const paid = all.filter((a) => a.payment_status === "paid");
    const pending = all.filter((a) => a.payment_status === "pending").length;
    const revenueCents = paid.reduce((sum, a) => sum + (a.amount_cents ?? 0), 0);
    const checkedIn = all.filter((a) => a.checked_in).length;
    return {
      total: all.length,
      confirmed: all.filter(isConfirmed).length,
      paid: paid.length,
      pending,
      revenueCents,
      currency: paid[0]?.currency ?? "eur",
      averageCents: paid.length ? Math.round(revenueCents / paid.length) : 0,
      completion: paid.length + pending ? Math.round((paid.length / (paid.length + pending)) * 100) : 0,
      checkedIn,
      checkInRate: all.length ? Math.round((checkedIn / all.length) * 100) : 0,
      countries: new Set(all.map((a) => a.nationality).filter(Boolean)).size,
      organisations: new Set(all.map((a) => a.organization?.trim().toLowerCase()).filter(Boolean)).size,
    };
  }, [all]);

  // ---------- over time ----------

  const series = useMemo(() => {
    const days = range === "all" ? "all" : Number(range);
    if (metric === "registrations") return bucketByDay(audienceList.map((a) => ({ at: a.created_at })), days);
    const paid = all.filter((a) => a.payment_status === "paid");
    return bucketByDay(paid.map((a) => ({ at: a.paid_at ?? a.created_at, value: (a.amount_cents ?? 0) / 100 })), days);
  }, [all, audienceList, range, metric]);

  // ---------- tickets ----------

  const ticketRows = useMemo(() => {
    const ids = Array.from(new Set([...tickets.map((t) => t.id), ...all.map((a) => a.ticket_type).filter(Boolean)])) as string[];
    return ids
      .map((id) => {
        const list = all.filter((a) => a.ticket_type === id);
        const paid = list.filter((a) => a.payment_status === "paid");
        return {
          id,
          name: ticketName(id),
          total: list.length,
          paid: paid.length,
          pending: list.filter((a) => a.payment_status === "pending").length,
          revenueCents: paid.reduce((sum, a) => sum + (a.amount_cents ?? 0), 0),
          checkedIn: list.filter((a) => a.checked_in).length,
        };
      })
      .sort((x, y) => y.total - x.total || x.name.localeCompare(y.name));
  }, [all, tickets, ticketName]);

  // ---------- who registered ----------

  const breakdowns = useMemo(() => {
    const list = audienceList;
    // The same organisation typed in different cases counts once, under its first spelling.
    const orgNames = new Map<string, string>();
    for (const a of list) {
      const name = a.organization?.trim();
      if (name && !orgNames.has(name.toLowerCase())) orgNames.set(name.toLowerCase(), name);
    }
    const flags: [string, number][] = (
      [
        ["Need an invitation letter", list.filter((a) => a.needs_invitation_letter).length],
        ["Want news from the organisers", list.filter((a) => a.opt_in_organizer).length],
        ["Accept contact from sponsors", list.filter((a) => a.opt_in_sponsors).length],
        ["Share their details with others", list.filter((a) => a.share_details).length],
        ["Noted a food allergy", list.filter((a) => a.food_allergies?.trim()).length],
      ] as [string, number][]
    ).filter(([, n]) => n > 0);
    return {
      total: list.length,
      nationality: countBy(list, (a) => a.nationality),
      residence: countBy(list, (a) => a.residence_country),
      category: countBy(list, (a) => categoryLabel(a.professional_category)),
      jobFunction: countBy(list, (a) => jobFunctionLabel(a.job_function)),
      organisation: countBy(list, (a) => orgNames.get(a.organization?.trim().toLowerCase() ?? "")),
      role: countBy(list, (a) => roleLabel(a.role)),
      source: countBy(list, (a) => SOURCE_LABELS[a.source ?? ""] ?? (a.source ? a.source : "Jotform")),
      promo: countBy(list, (a) => a.promo_code?.toUpperCase()),
      language: countBy(list, (a) => (a.language ? LANGUAGE_LABELS[a.language] ?? a.language : null)),
      flags,
    };
  }, [audienceList]);

  const loading = attendees === null && !loadError;
  const fmtMoney = (cents: number) => money(cents, summary.currency) || "€0";
  const refreshAll = () => {
    loadAttendees();
    setRefreshKey((k) => k + 1);
  };

  return (
    <AdminPage width="max-w-7xl">
      <PageHeader
        eyebrow="Analytics"
        title="Analytics"
        description={`${EVENT_INFO.name.en} · ${EVENT_INFO.date.en} · ${EVENT_INFO.place.en}${lastUpdated ? ` · Updated ${relativeTime(lastUpdated.toISOString())}` : ""}`}
        actions={
          <Button
            variant="outline"
            size="md"
            onClick={refreshAll}
            disabled={refreshing}
            aria-label="Refresh analytics"
            title="Refresh"
            className="px-3"
          >
            <IconRefresh className={cx("h-4 w-4", refreshing && "animate-spin")} />
          </Button>
        }
      />

      {loadError && attendees !== null && (
        <Alert tone="error" title="Couldn't refresh" action={<Button size="sm" variant="outline" onClick={loadAttendees}>Try again</Button>}>
          {loadError} Showing the numbers from {lastUpdated ? relativeTime(lastUpdated.toISOString()) : "earlier"}.
        </Alert>
      )}

      {loading ? (
        <AnalyticsSkeleton />
      ) : attendees === null ? (
        <ErrorState title="Couldn't load analytics" message={loadError} onRetry={loadAttendees} />
      ) : attendees.length === 0 ? (
        <Card>
          <EmptyState title="No registrations yet" body="Charts and breakdowns appear here as soon as people start registering." />
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
            <Kpi label="Registrations" value={summary.total} sub={`${summary.confirmed.toLocaleString()} confirmed`} />
            <Kpi label="Revenue" value={fmtMoney(summary.revenueCents)} sub={`${summary.paid.toLocaleString()} paid tickets`} />
            <Kpi label="Average ticket" value={fmtMoney(summary.averageCents)} sub="Per paid ticket" />
            <Kpi
              label="Finished paying"
              value={`${summary.completion}%`}
              sub={summary.pending ? `${summary.pending.toLocaleString()} still awaiting payment` : "Nobody left at checkout"}
            />
            <Kpi label="Checked in" value={summary.checkedIn} sub={`${summary.checkInRate}% of registrations`} />
            <Kpi label="Nationalities" value={summary.countries} sub={`${summary.organisations.toLocaleString()} organisations`} />
          </div>

          <Card className="space-y-4 p-5 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1">
                <h2 className="font-display text-xl font-bold text-blue">{metric === "registrations" ? "Registrations" : "Revenue"} over time</h2>
                <p className="text-sm text-ink-3">
                  {metric === "registrations" ? "By the day they registered." : "Paid tickets, by the day they paid."}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Segmented label="Measure" value={metric} onChange={setMetric} options={[["registrations", "Registrations"], ["revenue", "Revenue"]]} />
                <Segmented label="Period" value={range} onChange={setRange} options={[["30", "30 days"], ["90", "90 days"], ["all", "All time"]]} />
              </div>
            </div>
            <BarChart
              series={series}
              what={metric === "registrations" ? "Registrations" : "Revenue"}
              format={(v) => (metric === "revenue" ? fmtMoney(Math.round(v * 100)) : v.toLocaleString())}
            />
          </Card>

          <TicketTable rows={ticketRows} fmtMoney={fmtMoney} />

          <section aria-labelledby="who-heading" className="space-y-3">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div className="space-y-1">
                <h2 id="who-heading" className="font-display text-xl font-bold text-blue">Who registered</h2>
                <p className="text-sm text-ink-3">
                  {audience === "confirmed"
                    ? `${breakdowns.total.toLocaleString()} confirmed registrations. People still at the payment step are left out.`
                    : `All ${breakdowns.total.toLocaleString()} registrations, including people still at the payment step.`}
                </p>
              </div>
              <Segmented
                label="Who to count"
                value={audience}
                onChange={setAudience}
                options={[["everyone", "Everyone"], ["confirmed", "Confirmed only"]]}
              />
            </div>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              <Breakdown title="Nationality" rows={breakdowns.nationality} total={breakdowns.total} />
              <Breakdown title="Country of residence" rows={breakdowns.residence} total={breakdowns.total} />
              <Breakdown title="Professional category" rows={breakdowns.category} total={breakdowns.total} />
              <Breakdown title="Job function" rows={breakdowns.jobFunction} total={breakdowns.total} />
              <Breakdown title="Organisation" rows={breakdowns.organisation} total={breakdowns.total} />
              <Breakdown title="Category on badge" rows={breakdowns.role} total={breakdowns.total} />
              <Breakdown title="How they registered" rows={breakdowns.source} total={breakdowns.total} />
              <Breakdown title="Promo codes used" rows={breakdowns.promo} total={breakdowns.total} empty="No promo codes used yet." />
              <Breakdown title="Email language" rows={breakdowns.language} total={breakdowns.total} />
              <Breakdown title="Requests and consents" rows={breakdowns.flags} total={breakdowns.total} empty="Nobody has asked for any of these yet." />
            </div>
          </section>
        </>
      )}

      {/* Everyone's actions: super admins only, like the activity log itself. */}
      {me?.role === "super_admin" && <AdminActivitySection refreshKey={refreshKey} />}
    </AdminPage>
  );
}

type TicketRow = { id: string; name: string; total: number; paid: number; pending: number; revenueCents: number; checkedIn: number };

function TicketTable({ rows, fmtMoney }: { rows: TicketRow[]; fmtMoney: (cents: number) => string }) {
  const cols: [string, (r: TicketRow) => string][] = [
    ["Registrations", (r) => r.total.toLocaleString()],
    ["Paid", (r) => r.paid.toLocaleString()],
    ["Awaiting payment", (r) => r.pending.toLocaleString()],
    ["Revenue", (r) => fmtMoney(r.revenueCents)],
    ["Checked in", (r) => r.checkedIn.toLocaleString()],
  ];
  return (
    <Card className="@container overflow-hidden">
      <div className="space-y-1 p-5 pb-4 sm:p-6 sm:pb-4">
        <h2 className="font-display text-xl font-bold text-blue">Tickets</h2>
        <p className="text-sm text-ink-3">Every ticket type, including those nobody has chosen yet.</p>
      </div>
      {/* A table where there is room, a stacked list on narrow screens. */}
      <table className="hidden w-full text-left text-sm @2xl:table">
        <thead className="bg-subtle text-xs font-semibold uppercase tracking-wider text-ink-3">
          <tr>
            <th scope="col" className="px-5 py-2.5 sm:px-6">Ticket</th>
            {cols.map(([h]) => (
              <th key={h} scope="col" className="px-3 py-2.5 text-right last:pr-5 sm:last:pr-6">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t border-line">
              <th scope="row" className="px-5 py-3 font-semibold text-ink sm:px-6">{r.name}</th>
              {cols.map(([h, get]) => (
                <td key={h} className={cx("px-3 py-3 text-right last:pr-5 sm:last:pr-6", r.total ? "text-ink" : "text-ink-3")}>{get(r)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <ul className="border-t border-line @2xl:hidden">
        {rows.map((r) => (
          <li key={r.id} className="space-y-2 border-t border-line px-5 py-3 first:border-t-0">
            <div className="font-semibold text-ink">{r.name}</div>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
              {cols.map(([h, get]) => (
                <div key={h} className="flex justify-between gap-2">
                  <dt className="text-ink-3">{h}</dt>
                  <dd className="text-ink">{get(r)}</dd>
                </div>
              ))}
            </dl>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function AnalyticsSkeleton() {
  return (
    <div className="space-y-6">
      <LoadingLabel>Loading analytics</LoadingLabel>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        {Array.from({ length: 6 }, (_, i) => (
          <Card key={i} className="space-y-2 p-4">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-8 w-16" />
            <Skeleton className="h-3 w-24" />
          </Card>
        ))}
      </div>
      <Card className="space-y-4 p-5 sm:p-6">
        <Skeleton className="h-6 w-56" />
        <Skeleton className="h-48 w-full rounded-md sm:h-56" />
      </Card>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 3 }, (_, i) => (
          <Card key={i} className="space-y-3 p-4">
            <Skeleton className="h-3 w-28" />
            {[0, 1, 2, 3].map((j) => (
              <Skeleton key={j} className="h-4 w-full" />
            ))}
          </Card>
        ))}
      </div>
    </div>
  );
}
