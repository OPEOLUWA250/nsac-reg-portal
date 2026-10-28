"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAdmin } from "@/components/admin/AdminContext";
import { Breakdown, Kpi } from "@/components/admin/Stats";
import { AdminPage, Alert, Button, Card, cx, EmptyState, ErrorState, LoadingLabel, PageHeader, Skeleton } from "@/components/ui";
import { IconRefresh } from "@/components/icons";
import { categoryLabel, jobFunctionLabel, money, relativeTime } from "@/lib/admin-format";
import { EVENT_INFO } from "@/lib/event-info";
import { roleLabel } from "@/lib/role-style";
import type { Attendee } from "@/lib/types";
import type { Ticket } from "@/lib/tickets";

const POLL_INTERVAL_MS = 60_000;
const DAY_MS = 24 * 3600_000;

type Range = "30" | "90" | "all";
type Metric = "registrations" | "revenue";
type Audience = "everyone" | "confirmed";

const SOURCE_LABELS: Record<string, string> = { web: "Registration form", walk_in: "Walk-in (added by staff)", jotform: "Jotform" };
const LANGUAGE_LABELS: Record<string, string> = { en: "English", fr: "French" };

// Registered and not left waiting at the payment step.
const isConfirmed = (a: Attendee) => a.payment_status !== "pending";

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function shortDate(d: Date) {
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

/** Rows of [label, count], biggest first. Empty values are left out. */
function countBy(list: Attendee[], key: (a: Attendee) => string | null | undefined): [string, number][] {
  const map = new Map<string, number>();
  for (const a of list) {
    const k = key(a)?.trim();
    if (k) map.set(k, (map.get(k) ?? 0) + 1);
  }
  return [...map.entries()].sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0]));
}

/** A round number at or above `v`, for the top of the chart's scale. */
function niceCeil(v: number) {
  if (v <= 0) return 1;
  const pow = 10 ** Math.floor(Math.log10(v));
  return ([1, 2, 2.5, 5, 10].find((m) => m * pow >= v) ?? 10) * pow;
}

export default function AnalyticsPanel() {
  const { apiCall } = useAdmin();
  const [attendees, setAttendees] = useState<Attendee[] | null>(null);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loadError, setLoadError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

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
    const today = startOfDay(new Date());
    const earliest = all.reduce((min, a) => Math.min(min, new Date(a.created_at).getTime()), today.getTime());
    const start =
      range === "all" ? startOfDay(new Date(earliest)) : new Date(today.getFullYear(), today.getMonth(), today.getDate() - Number(range) + 1);
    const spanDays = Math.round((today.getTime() - start.getTime()) / DAY_MS) + 1;
    // Long stretches are shown by week (starting Monday) so the bars stay readable.
    const weekly = spanDays > 120;
    const step = weekly ? 7 : 1;
    const first = weekly ? new Date(start.getFullYear(), start.getMonth(), start.getDate() - ((start.getDay() + 6) % 7)) : start;
    const count = Math.floor(Math.round((today.getTime() - first.getTime()) / DAY_MS) / step) + 1;
    const buckets = Array.from({ length: count }, (_, i) => {
      const d = new Date(first.getFullYear(), first.getMonth(), first.getDate() + i * step);
      return { label: weekly ? `Week of ${shortDate(d)}` : shortDate(d), short: shortDate(d), value: 0 };
    });
    const add = (iso: string | null, amount: number) => {
      if (!iso) return;
      const day = startOfDay(new Date(iso));
      if (day < start) return;
      const i = Math.floor(Math.round((day.getTime() - first.getTime()) / DAY_MS) / step);
      if (buckets[i]) buckets[i].value += amount;
    };
    if (metric === "registrations") {
      for (const a of audienceList) add(a.created_at, 1);
    } else {
      for (const a of all) if (a.payment_status === "paid") add(a.paid_at ?? a.created_at, (a.amount_cents ?? 0) / 100);
    }
    return { buckets, weekly, total: buckets.reduce((s, b) => s + b.value, 0) };
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
            onClick={loadAttendees}
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

          <OverTime
            series={series}
            metric={metric}
            onMetric={setMetric}
            range={range}
            onRange={setRange}
            format={(v) => (metric === "revenue" ? fmtMoney(Math.round(v * 100)) : v.toLocaleString())}
          />

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
    </AdminPage>
  );
}

function Segmented<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: [T, string][];
}) {
  return (
    <div role="group" aria-label={label} className="inline-flex overflow-hidden rounded-md border border-line-strong">
      {options.map(([v, l]) => (
        <button
          key={v}
          type="button"
          aria-pressed={value === v}
          onClick={() => onChange(v)}
          className={cx(
            "min-h-11 border-l border-line-strong px-3 text-sm font-semibold transition-colors duration-150 first:border-l-0 sm:min-h-9",
            value === v ? "bg-blue text-white" : "bg-surface text-ink-2 hover:bg-subtle active:bg-line"
          )}
        >
          {l}
        </button>
      ))}
    </div>
  );
}

function OverTime({
  series,
  metric,
  onMetric,
  range,
  onRange,
  format,
}: {
  series: { buckets: { label: string; short: string; value: number }[]; weekly: boolean; total: number };
  metric: Metric;
  onMetric: (m: Metric) => void;
  range: Range;
  onRange: (r: Range) => void;
  format: (v: number) => string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const { buckets, weekly, total } = series;
  const max = niceCeil(Math.max(0, ...buckets.map((b) => b.value)));
  const peak = buckets.reduce((best, b) => (b.value > best.value ? b : best), buckets[0]);
  const hovered = hover !== null ? buckets[hover] : null;
  const unit = weekly ? "week" : "day";
  const what = metric === "registrations" ? "Registrations" : "Revenue";
  const ticks = [max, max / 2, 0];
  const labelAt = [0, Math.floor((buckets.length - 1) / 2), buckets.length - 1];

  return (
    <Card className="space-y-4 p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 className="font-display text-xl font-bold text-blue">{what} over time</h2>
          <p className="text-sm text-ink-3">
            {metric === "registrations" ? `By the ${unit} they registered.` : `Paid tickets, by the ${unit} they paid.`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Segmented label="Measure" value={metric} onChange={onMetric} options={[["registrations", "Registrations"], ["revenue", "Revenue"]]} />
          <Segmented label="Period" value={range} onChange={onRange} options={[["30", "30 days"], ["90", "90 days"], ["all", "All time"]]} />
        </div>
      </div>

      {/* Readout: the hovered bar, or the period's total and best day. */}
      <p aria-live="polite" className="min-h-6 text-sm text-ink">
        {hovered ? (
          <>
            <span className="font-semibold">{hovered.label}</span>: {format(hovered.value)}
          </>
        ) : (
          <>
            <span className="font-semibold">{format(total)}</span> in this period
            {peak && peak.value > 0 && (
              <span className="text-ink-3">
                {" "}· Best {unit}: {peak.label}, {format(peak.value)}
              </span>
            )}
          </>
        )}
      </p>

      <div className="flex gap-2">
        <div aria-hidden="true" className="flex h-48 shrink-0 flex-col justify-between text-right text-xs text-ink-3 sm:h-56">
          {ticks.map((t, i) => (
            <span key={i} className="-my-2 leading-4">{format(t)}</span>
          ))}
        </div>
        <div className="min-w-0 flex-1">
          <div
            role="img"
            aria-label={`${what} per ${unit}: ${format(total)} in this period. The table below lists each ${unit}.`}
            className="relative h-48 sm:h-56"
            onMouseLeave={() => setHover(null)}
          >
            {ticks.map((_, i) => (
              <div key={i} aria-hidden="true" className="absolute inset-x-0 border-t border-line" style={{ top: `${(i / (ticks.length - 1)) * 100}%` }} />
            ))}
            <div className="absolute inset-0 flex items-end gap-0.5">
              {buckets.map((b, i) => (
                <div
                  key={i}
                  className="flex h-full min-w-0 flex-1 items-end"
                  onMouseEnter={() => setHover(i)}
                  onTouchStart={() => setHover(i)}
                >
                  <div
                    className={cx("w-full rounded-t-sm transition-colors duration-150", hover === i ? "bg-gold" : "bg-blue")}
                    style={{ height: b.value ? `max(2px, ${(b.value / max) * 100}%)` : 0 }}
                  />
                </div>
              ))}
            </div>
          </div>
          <div aria-hidden="true" className="mt-1.5 flex justify-between text-xs text-ink-3">
            {labelAt.map((i, n) => (
              <span key={n}>{buckets[i]?.short}</span>
            ))}
          </div>
        </div>
      </div>

      <details className="text-sm">
        <summary className="min-h-11 cursor-pointer content-center font-semibold text-blue">Show as a table</summary>
        <div className="mt-2 max-h-72 overflow-y-auto rounded-md border border-line">
          <table className="w-full text-left">
            <thead className="sticky top-0 bg-subtle text-xs font-semibold uppercase tracking-wider text-ink-3">
              <tr>
                <th scope="col" className="px-3 py-2">{weekly ? "Week" : "Day"}</th>
                <th scope="col" className="px-3 py-2 text-right">{what}</th>
              </tr>
            </thead>
            <tbody>
              {buckets
                .map((b, i) => [b, i] as const)
                .reverse()
                .map(([b, i]) => (
                  <tr key={i} className="border-t border-line">
                    <td className="px-3 py-2 text-ink">{b.label}</td>
                    <td className="px-3 py-2 text-right text-ink">{format(b.value)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </details>
    </Card>
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
