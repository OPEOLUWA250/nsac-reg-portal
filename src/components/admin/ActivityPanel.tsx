"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAdmin } from "@/components/admin/AdminContext";
import { Avatar } from "@/components/AttendeeDrawer";
import {
  AdminPage,
  Button,
  Card,
  Chip,
  cx,
  EmptyState,
  ErrorState,
  inputClass,
  LoadingLabel,
  PageHeader,
  Skeleton,
} from "@/components/ui";
import { IconRefresh, IconSearch } from "@/components/icons";
import { ACTIVITY_AREAS, AREA_LABEL, type ActivityArea, type ActivityEntry } from "@/lib/activity";

// /admin/activity: who did what in the admin, newest first, by day. Super
// admins only. Filter by area or admin, or search; entries about a
// registration open it on the dashboard.

const POLL_MS = 30_000;

// Colour per area, from the brand palette (dots only, the text stays ink).
const AREA_DOT: Record<ActivityArea, string> = {
  sign_in: "var(--color-ink-3)",
  registrations: "var(--color-blue)",
  check_in: "var(--color-success)",
  tickets: "var(--color-gold)",
  promo_codes: "var(--color-gold)",
  student_codes: "var(--color-gold)",
  booths: "var(--color-blue)",
  letters: "var(--color-blue)",
  admins: "var(--color-danger)",
  settings: "var(--color-danger)",
};

interface Page {
  entries: ActivityEntry[];
  hasMore: boolean;
  admins: string[];
}

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: d.getFullYear() === today.getFullYear() ? undefined : "numeric" });
}

const time = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

export default function ActivityPanel() {
  const { apiCall, me, setRequestedAttendee } = useAdmin();
  const router = useRouter();
  const isSuper = me?.role === "super_admin";
  const [entries, setEntries] = useState<ActivityEntry[] | null>(null);
  const [admins, setAdmins] = useState<string[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState<"first" | "more" | null>(null);
  const [area, setArea] = useState<"all" | ActivityArea>("all");
  const [actor, setActor] = useState("all");
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");

  // Search after typing stops.
  useEffect(() => {
    const t = setTimeout(() => setQ(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const query = useCallback(
    (before?: number) => {
      const p = new URLSearchParams();
      if (before) p.set("before", String(before));
      if (area !== "all") p.set("area", area);
      if (actor !== "all") p.set("actor", actor);
      if (q) p.set("q", q);
      return apiCall(`/api/admin/activity-log?${p}`) as unknown as Promise<Page>;
    },
    [apiCall, area, actor, q]
  );

  const loadFirst = useCallback(async () => {
    setLoading("first");
    try {
      const page = await query();
      setEntries(page.entries);
      setHasMore(page.hasMore);
      setAdmins(page.admins);
      setLoadError("");
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Couldn't load the activity.");
    } finally {
      setLoading(null);
    }
  }, [query]);

  useEffect(() => {
    if (!isSuper) return;
    const t = setTimeout(loadFirst, 0);
    return () => clearTimeout(t);
  }, [isSuper, loadFirst]);

  // New entries appear at the top on their own; older pages already loaded stay.
  const newest = useRef(0);
  useEffect(() => {
    newest.current = entries?.[0]?.id ?? 0;
  }, [entries]);
  useEffect(() => {
    if (!isSuper) return;
    const timer = setInterval(async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const page = await query();
        const fresh = page.entries.filter((e) => e.id > newest.current);
        if (fresh.length) setEntries((prev) => [...fresh, ...(prev ?? [])]);
      } catch {
        /* the next tick tries again */
      }
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [isSuper, query]);

  async function loadMore() {
    const last = entries?.at(-1)?.id;
    if (!last) return;
    setLoading("more");
    try {
      const page = await query(last);
      setEntries((prev) => [...(prev ?? []), ...page.entries]);
      setHasMore(page.hasMore);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Couldn't load more.");
    } finally {
      setLoading(null);
    }
  }

  const days = useMemo(() => {
    const groups: [string, ActivityEntry[]][] = [];
    for (const e of entries ?? []) {
      const label = dayLabel(e.at);
      const group = groups.at(-1);
      if (group && group[0] === label) group[1].push(e);
      else groups.push([label, [e]]);
    }
    return groups;
  }, [entries]);

  const filtered = area !== "all" || actor !== "all" || q !== "";
  const header = (
    <PageHeader
      eyebrow="Admin"
      title="Activity"
      description="What admins have done, newest first: sign-ins, changes to registrations, check-ins, tickets, codes, booths, letters, admins and settings."
      actions={
        isSuper ? (
          <Button variant="outline" onClick={loadFirst} disabled={loading !== null} aria-label="Refresh activity" title="Refresh" className="px-3">
            <IconRefresh className={cx("h-4 w-4", loading === "first" && "animate-spin")} />
          </Button>
        ) : null
      }
    />
  );

  if (me && !isSuper) {
    return (
      <AdminPage width="max-w-4xl">
        {header}
        <EmptyState title="Only super admins can see the activity" body="It shows what every admin has done. Ask a super admin if you need to check something." />
      </AdminPage>
    );
  }

  return (
    <AdminPage width="max-w-4xl">
      {header}

      <Card className="space-y-3 p-4">
        <div className="relative">
          <IconSearch className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" />
          <label htmlFor="activity-search" className="sr-only">
            Search the activity
          </label>
          <input
            id="activity-search"
            type="search"
            className={inputClass(false, "pl-10")}
            placeholder="Search, e.g. a name, VIP, passport, promo code"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="grid items-center gap-2 sm:grid-cols-[1fr_1fr_auto]">
          <select aria-label="Area" value={area} onChange={(e) => setArea(e.target.value as typeof area)} className={inputClass()}>
            <option value="all">All areas</option>
            {ACTIVITY_AREAS.map((a) => (
              <option key={a} value={a}>
                {AREA_LABEL[a]}
              </option>
            ))}
          </select>
          <select aria-label="Admin" value={actor} onChange={(e) => setActor(e.target.value)} className={inputClass()}>
            <option value="all">All admins</option>
            {admins.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
          {filtered && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setArea("all");
                setActor("all");
                setSearch("");
              }}
            >
              Clear filters
            </Button>
          )}
        </div>
      </Card>

      {entries === null ? (
        loadError ? (
          <ErrorState title="Couldn't load the activity" message={loadError} onRetry={loadFirst} />
        ) : (
          <Card className="space-y-4 p-5">
            <LoadingLabel>Loading activity</LoadingLabel>
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </Card>
        )
      ) : entries.length === 0 ? (
        <EmptyState
          title={filtered ? "Nothing matches these filters" : "Nothing recorded yet"}
          body={filtered ? "Try another search, or clear the filters." : "Actions in the admin show up here as they happen, starting now."}
        />
      ) : (
        <div className={cx("space-y-6 transition-opacity duration-150", loading === "first" && "opacity-60")}>
          {days.map(([day, list]) => (
            <section key={day} aria-labelledby={`day-${day}`} className="space-y-2">
              <h2 id={`day-${day}`} className="text-xs font-semibold uppercase tracking-wider text-ink-3">
                {day}
              </h2>
              <Card className="overflow-hidden">
                <ol className="divide-y divide-line">
                  {list.map((e) => (
                    <Row
                      key={e.id}
                      entry={e}
                      onOpen={
                        e.targetType === "attendee" && e.targetId && !e.action.startsWith("attendee.deleted")
                          ? () => {
                              setRequestedAttendee(e.targetId);
                              router.push("/admin");
                            }
                          : undefined
                      }
                    />
                  ))}
                </ol>
              </Card>
            </section>
          ))}
          {hasMore && (
            <div className="flex justify-center">
              <Button variant="outline" onClick={loadMore} loading={loading === "more"}>
                Load older activity
              </Button>
            </div>
          )}
        </div>
      )}
    </AdminPage>
  );
}

function Row({ entry: e, onOpen }: { entry: ActivityEntry; onOpen?: () => void }) {
  const who = e.actorEmail ?? "The system";
  const extra = e.details && Object.entries(e.details).filter(([, v]) => v !== null && v !== undefined && v !== "");
  return (
    <li className="grid grid-cols-[2.25rem_1fr] gap-3 px-4 py-3 sm:grid-cols-[3.25rem_2.25rem_1fr_auto] sm:items-center">
      <time dateTime={e.at} title={new Date(e.at).toLocaleString("en-GB")} className="hidden text-sm tabular-nums text-ink-3 sm:block">
        {time(e.at)}
      </time>
      <Avatar name={who.split("@")[0].replace(/[._-]+/g, " ")} />
      <div className="min-w-0 space-y-1">
        <p className="text-sm text-ink [overflow-wrap:anywhere]">
          <strong className="font-semibold">{who}</strong> {e.summary}
        </p>
        <div className="flex flex-wrap items-center gap-2 text-xs text-ink-3">
          <span className="tabular-nums sm:hidden">{time(e.at)}</span>
          <Chip dot={AREA_DOT[e.area]}>{AREA_LABEL[e.area]}</Chip>
          {extra && extra.length > 0 && (
            <details className="group">
              <summary className="cursor-pointer rounded-sm underline decoration-line-strong underline-offset-2 hover:text-ink">Details</summary>
              <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
                {extra.map(([k, v]) => (
                  <div key={k} className="contents">
                    <dt className="text-ink-3">{k}</dt>
                    <dd className="text-ink-2 [overflow-wrap:anywhere]">{Array.isArray(v) ? v.join(", ") : String(v)}</dd>
                  </div>
                ))}
              </dl>
            </details>
          )}
        </div>
      </div>
      {onOpen && (
        <div className="col-start-2 sm:col-start-auto">
          <Button variant="outline" size="sm" onClick={onOpen}>
            Open
          </Button>
        </div>
      )}
    </li>
  );
}
