"use client";

import { useState } from "react";
import { Card, cx } from "@/components/ui";

// Number tiles and bar lists, shared by the Dashboard and Analytics pages.

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
