"use client";

import { useState } from "react";
import { Card, cx } from "@/components/ui";
import { niceCeil, type Series } from "@/lib/analytics";

// Number tiles, bar lists and charts, shared by the Dashboard and Analytics pages.

export function Kpi({
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

/** Rows of label, count and a bar sized against `total`. Long lists fold after `limit`. */
export function Breakdown({
  title,
  rows,
  total,
  limit = 8,
  empty = "Nobody has answered this yet.",
}: {
  title: string;
  rows: [string, number][];
  total: number;
  limit?: number;
  empty?: string;
}) {
  const [showAll, setShowAll] = useState(false);
  const shown = showAll ? rows : rows.slice(0, limit);
  return (
    <Card className="p-4">
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-ink-3">{title}</h2>
      {rows.length === 0 ? (
        <p className="text-sm text-ink-3">{empty}</p>
      ) : (
        <>
          <ul className="space-y-2.5">
            {shown.map(([label, n]) => (
              <li key={label}>
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="truncate text-ink" title={label}>{label}</span>
                  <span className="shrink-0 text-ink">
                    <span className="font-semibold">{n.toLocaleString()}</span>
                    {total > 0 && <span className="ml-1.5 text-ink-3">{Math.round((n / total) * 100)}%</span>}
                  </span>
                </div>
                <div className="mt-1 h-1.5 rounded-sm bg-subtle">
                  <div className="h-full rounded-sm bg-gold" style={{ width: `${Math.max(4, total ? (n / total) * 100 : 0)}%` }} />
                </div>
              </li>
            ))}
          </ul>
          {rows.length > limit && (
            <button
              type="button"
              onClick={() => setShowAll((s) => !s)}
              aria-expanded={showAll}
              className="mt-3 min-h-11 text-sm font-semibold text-blue underline decoration-line-strong underline-offset-2 transition-colors duration-150 hover:decoration-blue"
            >
              {showAll ? "Show fewer" : `Show all ${rows.length}`}
            </button>
          )}
        </>
      )}
    </Card>
  );
}

/** A row of toggle buttons, one pressed. */
export function Segmented<T extends string>({
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

/**
 * Bars per day (or week) from bucketByDay, with a readout line that shows the
 * hovered bar, or else the total and the best day. Also readable as a table.
 */
export function BarChart({ series, what, format }: { series: Series; what: string; format: (v: number) => string }) {
  const [hover, setHover] = useState<number | null>(null);
  const { buckets, weekly, total } = series;
  const max = niceCeil(Math.max(0, ...buckets.map((b) => b.value)));
  const peak = buckets.reduce((best, b) => (b.value > best.value ? b : best), buckets[0]);
  const hovered = hover !== null ? buckets[hover] : null;
  const unit = weekly ? "week" : "day";
  const ticks = [max, max / 2, 0];
  const labelAt = [0, Math.floor((buckets.length - 1) / 2), buckets.length - 1];

  return (
    <div className="space-y-4">
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
                {" "}· Busiest {unit}: {peak.label}, {format(peak.value)}
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
                <div key={i} className="flex h-full min-w-0 flex-1 items-end" onMouseEnter={() => setHover(i)} onTouchStart={() => setHover(i)}>
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
              {[...buckets].reverse().map((b) => (
                <tr key={b.label} className="border-t border-line">
                  <td className="px-3 py-2 text-ink">{b.label}</td>
                  <td className="px-3 py-2 text-right text-ink">{format(b.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
