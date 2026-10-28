"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAdmin } from "@/components/admin/AdminContext";
import { Avatar } from "@/components/AttendeeDrawer";
import { ADMIN_NAV, ADMIN_NAV_BOTTOM } from "@/components/admin/admin-nav";
import { BarChart, Breakdown, Kpi, Segmented } from "@/components/admin/Stats";
import { Alert, ButtonLink, Card, Chip, ErrorState, LoadingLabel, Skeleton } from "@/components/ui";
import { AREA_LABEL, type ActivityArea } from "@/lib/activity";
import { relativeTime } from "@/lib/admin-format";
import { bucketByDay, countBy } from "@/lib/analytics";

// The "Admin activity" part of /admin/analytics: how much admins have done,
// who, in which areas, and the latest actions. Super admins only (the page
// leaves it out for others). Reads /api/admin/analytics/activity.

const POLL_MS = 60_000;

type Days = "7" | "30" | "90";

interface Data {
  events: { at: string; actor: string | null; area: ActivityArea }[];
  truncated: boolean;
  recent: { id: number; at: string; actorEmail: string | null; area: ActivityArea; summary: string }[];
}

// The full log has its own page when that feature is installed.
const HAS_ACTIVITY_PAGE = [...ADMIN_NAV, ...ADMIN_NAV_BOTTOM].some((i) => i.href === "/admin/activity");

const who = (email: string | null) => email ?? "The system";

export default function AdminActivitySection({ refreshKey }: { refreshKey: number }) {
  const { apiCall } = useAdmin();
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<{ message: string; notSetUp: boolean } | null>(null);
  const [days, setDays] = useState<Days>("30");

  const load = useCallback(async () => {
    try {
      setData((await apiCall("/api/admin/analytics/activity")) as unknown as Data);
      setError(null);
    } catch (err) {
      const e = err as Error & { status?: number };
      setError({ message: e.message || "Couldn't load the admin activity.", notSetUp: e.status === 503 });
    }
  }, [apiCall]);

  useEffect(() => {
    const first = setTimeout(load, 0);
    const timer = setInterval(() => document.visibilityState === "visible" && load(), POLL_MS);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [load, refreshKey]);

  const view = useMemo(() => {
    if (!data) return null;
    const n = Number(days);
    const series = bucketByDay(data.events, n);
    // The same window as the chart: from midnight n - 1 days ago.
    const now = new Date();
    const from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - n + 1).getTime();
    const events = data.events.filter((e) => new Date(e.at).getTime() >= from);
    const byAdmin = countBy(events, (e) => who(e.actor));
    return {
      series,
      total: events.length,
      perDay: events.length / n,
      admins: new Set(events.map((e) => e.actor).filter(Boolean)).size,
      mostActive: byAdmin.find(([name]) => name !== "The system")?.[0],
      signIns: events.filter((e) => e.area === "sign_in").length,
      byAdmin,
      byArea: countBy(events, (e) => AREA_LABEL[e.area]),
    };
  }, [data, days]);

  const latest = data?.recent[0];

  return (
    <section aria-labelledby="admin-activity-heading" className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h2 id="admin-activity-heading" className="font-display text-xl font-bold text-blue">Admin activity</h2>
          <p className="text-sm text-ink-3">What admins have done in the admin: sign-ins, changes, check-ins and downloads. Only super admins see this.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Segmented label="Activity period" value={days} onChange={setDays} options={[["7", "7 days"], ["30", "30 days"], ["90", "90 days"]]} />
          {HAS_ACTIVITY_PAGE && (
            <ButtonLink href="/admin/activity" variant="outline" size="sm">
              Full activity log
            </ButtonLink>
          )}
        </div>
      </div>

      {error && !data ? (
        error.notSetUp ? (
          <Alert tone="info" title="Nothing to show yet">{error.message}</Alert>
        ) : (
          <ErrorState title="Couldn't load the admin activity" message={error.message} onRetry={load} />
        )
      ) : !view || !data ? (
        <Card className="space-y-4 p-5">
          <LoadingLabel>Loading admin activity</LoadingLabel>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi label="Actions" value={view.total} sub={view.total ? `About ${Math.round(view.perDay * 10) / 10} a day` : "None in this period"} />
            <Kpi label="Admins active" value={view.admins} sub={view.mostActive ? `Most active: ${view.mostActive}` : "Nobody in this period"} />
            <Kpi label="Sign-ins" value={view.signIns} sub="To the admin" />
            <Kpi
              label="Last action"
              value={latest ? relativeTime(latest.at) : "None"}
              sub={latest ? who(latest.actorEmail) : "Nothing recorded yet"}
            />
          </div>

          <Card className="space-y-4 p-5 sm:p-6">
            <h3 className="font-display text-xl font-bold text-blue">Actions over time</h3>
            <BarChart series={view.series} what="Actions" format={(v) => v.toLocaleString()} />
            {data.truncated && <p className="text-sm text-ink-3">Counts show the latest 10,000 actions only.</p>}
          </Card>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <Breakdown title="By admin" rows={view.byAdmin} total={view.total} empty="No actions in this period." />
            <Breakdown title="By area" rows={view.byArea} total={view.total} empty="No actions in this period." />
            <Card className="p-4 md:col-span-2 xl:col-span-1">
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-ink-3">Latest actions</h3>
              {data.recent.length === 0 ? (
                <p className="text-sm text-ink-3">Nothing recorded yet. Actions in the admin show up here as they happen.</p>
              ) : (
                <ol className="space-y-3">
                  {data.recent.map((e) => (
                    <li key={e.id} className="grid grid-cols-[2.25rem_1fr] gap-3">
                      <Avatar name={who(e.actorEmail).split("@")[0].replace(/[._-]+/g, " ")} />
                      <div className="min-w-0 space-y-1">
                        <p className="text-sm text-ink [overflow-wrap:anywhere]">
                          <strong className="font-semibold">{who(e.actorEmail)}</strong> {e.summary}
                        </p>
                        <div className="flex flex-wrap items-center gap-2 text-xs text-ink-3">
                          <time dateTime={e.at} title={new Date(e.at).toLocaleString("en-GB")}>{relativeTime(e.at)}</time>
                          <Chip>{AREA_LABEL[e.area]}</Chip>
                        </div>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </Card>
          </div>
        </>
      )}
    </section>
  );
}
