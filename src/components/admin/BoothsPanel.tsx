"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { faArrowUpRightFromSquare, faQrcode } from "@fortawesome/free-solid-svg-icons";
import {
  AdminPage,
  Alert,
  Button,
  ButtonLink,
  Card,
  Chip,
  cx,
  describedBy,
  ErrorState,
  Field,
  inputClass,
  linkClass,
  LoadingLabel,
  PageHeader,
  Skeleton,
} from "@/components/ui";
import FaIcon from "@/components/FaIcon";
import { IconRefresh, IconSearch } from "@/components/icons";
import { useAdmin } from "@/components/admin/AdminContext";
import { BOOTH_FILL, FloorPlan } from "@/components/venue/VenueMap";
import { relativeTime } from "@/lib/admin-format";
import { BOOTHS, BOOTH_SIZE_LABEL, MAP_H, MAP_W, ZONES } from "@/lib/venue/data";
import { buildPlaces, type ExhibitorMap } from "@/lib/venue/places";
import { LIMITS, parseBoothAssignment, type AssignmentStatus, type BoothAssignmentInput, type BoothFieldErrors } from "@/lib/venue/booth-fields";

// /admin/booths: which company has which booth. Pick a booth on the plan or
// in the list, fill in the company, save: the public venue map (/venue) shows
// it on the next page load, on the booth, in search and in the directions.

interface Assignment extends BoothAssignmentInput {
  updatedAt: string;
  updatedBy: string | null;
}

type Show = "all" | "sold" | "reserved" | "free";
type Draft = { status: AssignmentStatus; companyName: string; sector: string; website: string };

const EMPTY: Draft = { status: "sold", companyName: "", sector: "", website: "" };

const STATUS_DOT: Record<AssignmentStatus | "free", string> = {
  sold: "var(--color-success)",
  reserved: "var(--color-gold)",
  free: "var(--color-line-strong)",
};
const STATUS_LABEL: Record<AssignmentStatus | "free", string> = { sold: "Sold", reserved: "Reserved", free: "Free" };
const ROOM_NAME = Object.fromEntries(ZONES.map((z) => [z.id, z.name])) as Record<string, string>;
const ROOM_ORDER = ["north", "west", "east", "entr"];
const SORTED_BOOTHS = [...BOOTHS].sort(
  (a, b) => ROOM_ORDER.indexOf(a.room) - ROOM_ORDER.indexOf(b.room) || a.code.localeCompare(b.code, undefined, { numeric: true })
);

const draftOf = (a: Assignment | undefined): Draft =>
  a ? { status: a.status, companyName: a.companyName, sector: a.sector ?? "", website: a.website ?? "" } : EMPTY;

export default function BoothsPanel() {
  const { apiCall } = useAdmin();
  const [assignments, setAssignments] = useState<Map<string, Assignment> | null>(null);
  const [loadError, setLoadError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [fieldErrors, setFieldErrors] = useState<BoothFieldErrors>({});
  const [saving, setSaving] = useState<"save" | "free" | null>(null);
  const [saveError, setSaveError] = useState("");
  const [notice, setNotice] = useState("");
  const [show, setShow] = useState<Show>("all");
  const [query, setQuery] = useState("");
  const editorRef = useRef<HTMLDivElement>(null);

  const load = useCallback(() => {
    setRefreshing(true);
    return apiCall("/api/admin/booths")
      .then(
        (json) => {
          setAssignments(new Map((json.assignments as Assignment[]).map((a) => [a.boothCode, a])));
          setLoadError("");
        },
        (err) => setLoadError(err instanceof Error ? err.message : "Couldn't load the booths.")
      )
      .finally(() => setRefreshing(false));
  }, [apiCall]);

  useEffect(() => {
    const first = setTimeout(load, 0);
    return () => clearTimeout(first);
  }, [load]);

  const current = selected ? assignments?.get(selected) : undefined;
  const dirty = JSON.stringify(draft) !== JSON.stringify(draftOf(current));

  // The plan as the public map shows it: reserved booths hatched, without their name.
  const places = useMemo(() => {
    const ex: ExhibitorMap = {};
    for (const a of assignments?.values() ?? [])
      ex[a.boothCode] = a.status === "reserved" ? { status: "reserved" } : { status: "sold", company: a.companyName, sector: a.sector, website: a.website };
    return buildPlaces(ex);
  }, [assignments]);

  function select(code: string, scroll = false) {
    if (code === selected) return;
    if (dirty && !window.confirm(`Discard your changes to ${selected}?`)) return;
    setSelected(code);
    setDraft(draftOf(assignments?.get(code)));
    setFieldErrors({});
    setSaveError("");
    setNotice("");
    if (scroll && window.matchMedia("(max-width: 1023px)").matches) editorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((d) => ({ ...d, [key]: value }));
    setFieldErrors((e) => ({ ...e, [key]: undefined }));
  };

  async function save() {
    if (!selected) return;
    setSaveError("");
    setNotice("");
    // Same checks as the server, so mistakes show before anything is sent.
    const parsed = parseBoothAssignment({ boothCode: selected, ...draft });
    if ("fields" in parsed) return setFieldErrors(parsed.fields);
    setSaving("save");
    try {
      const json = await apiCall("/api/admin/booths", { method: "PUT", body: JSON.stringify(parsed.value) });
      const saved = json.assignment as Assignment;
      setAssignments((m) => new Map(m).set(saved.boothCode, saved));
      setDraft(draftOf(saved));
      setNotice(
        saved.status === "reserved"
          ? `${saved.boothCode} is reserved for ${saved.companyName}. The venue map shows it as reserved, without the name.`
          : `${saved.boothCode} is now ${saved.companyName}. The venue map shows it on its next load.`
      );
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Couldn't save the booth.");
      const fields = (err as { body?: { fields?: BoothFieldErrors } }).body?.fields;
      if (fields) setFieldErrors(fields);
    } finally {
      setSaving(null);
    }
  }

  async function free() {
    if (!selected || !current) return;
    if (!window.confirm(`Free ${selected}? ${current.companyName} will no longer show on the venue map.`)) return;
    setSaving("free");
    setSaveError("");
    setNotice("");
    try {
      await apiCall("/api/admin/booths", { method: "DELETE", body: JSON.stringify({ boothCode: selected }) });
      setAssignments((m) => {
        const next = new Map(m);
        next.delete(selected);
        return next;
      });
      setDraft(EMPTY);
      setNotice(`${selected} is free again.`);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Couldn't free the booth.");
    } finally {
      setSaving(null);
    }
  }

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase().replace(/-/g, "");
    return SORTED_BOOTHS.filter((b) => {
      const a = assignments?.get(b.code);
      if (show !== "all" && (a?.status ?? "free") !== show) return false;
      if (!q) return true;
      return [b.code.replace(/-/g, ""), a?.companyName, a?.sector, ROOM_NAME[b.room]].some((v) => v?.toLowerCase().replace(/-/g, "").includes(q));
    });
  }, [assignments, show, query]);

  const counts = { sold: 0, reserved: 0, free: BOOTHS.length };
  for (const a of assignments?.values() ?? []) {
    counts[a.status]++;
    counts.free--;
  }
  const err = (k: keyof BoothFieldErrors) => fieldErrors[k] || undefined;
  const aria = (id: string, e?: string, hint?: boolean) => ({ "aria-invalid": !!e, "aria-describedby": describedBy(id, { hint, error: e }) });
  const booth = selected ? BOOTHS.find((b) => b.code === selected) : null;

  return (
    // The map's colours live in .venue; always light here, the admin has no dark mode.
    <div className="venue" data-theme="light">
    <AdminPage>
      <PageHeader
        eyebrow="Venue map"
        title="Booths"
        description="Assign each booth to its exhibitor. Sold booths show the company's name on the venue map: on the booth, in search, in the exhibitor list and in the directions. Reserved booths show as reserved, without the name."
        actions={
          <>
            <ButtonLink href="/venue" target="_blank" variant="outline">
              <FaIcon icon={faArrowUpRightFromSquare} className="h-3.5 w-3.5" />
              Open the venue map
            </ButtonLink>
            <ButtonLink href="/admin/venue-stickers" variant="outline">
              <FaIcon icon={faQrcode} />
              QR stickers
            </ButtonLink>
            <Button variant="outline" onClick={() => load()} disabled={refreshing} aria-label="Refresh booths" title="Refresh" className="px-3">
              <IconRefresh className={cx("h-4 w-4", refreshing && "animate-spin")} />
            </Button>
          </>
        }
      />

      {assignments === null ? (
        loadError ? (
          <ErrorState title="Couldn't load the booths" message={loadError} onRetry={() => { setLoadError(""); load(); }} />
        ) : (
          <Card className="p-5">
            <LoadingLabel>Loading booths</LoadingLabel>
            <Skeleton className="aspect-[200/114] w-full rounded-lg" />
          </Card>
        )
      ) : (
        <>
          <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
            <Card className="overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3 sm:px-5">
                <p className="text-sm text-ink-2">
                  {BOOTHS.length} booths · {counts.sold} sold · {counts.reserved} reserved · {counts.free} free
                </p>
                <p className="text-sm text-ink-3">Click a booth to edit it. Hatched booths are reserved; faded ones are free.</p>
              </div>
              <div>
                <svg
                  viewBox={`-2 -1 ${MAP_W + 4} ${MAP_H + 2}`}
                  role="img"
                  aria-label="Venue floor plan. Sold booths are in full colour, reserved booths are hatched, free booths are faded."
                  className="block w-full select-none"
                  style={{ background: "var(--map-bg)" }}
                  onClick={(e) => {
                    const id = (e.target as Element).closest("[data-id]")?.getAttribute("data-id");
                    if (id && BOOTHS.some((b) => b.code === id)) select(id, true);
                  }}
                >
                  <FloorPlan places={places} selectedId={selected} fadeFree />
                </svg>
              </div>
            </Card>

            <div ref={editorRef} className="scroll-mt-20 lg:sticky lg:top-6">
              <Card className="p-5">
                {!booth ? (
                  <div className="space-y-2">
                    <h2 className="font-display text-xl font-bold text-blue">Edit a booth</h2>
                    <p className="text-sm text-ink-3">Pick a booth on the plan, or from the list below.</p>
                  </div>
                ) : (
                  <form
                    noValidate
                    onSubmit={(e) => {
                      e.preventDefault();
                      save();
                    }}
                    className="space-y-5"
                  >
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="font-display text-xl font-bold text-blue">Booth {booth.code}</h2>
                        <Chip dot={STATUS_DOT[current?.status ?? "free"]}>{STATUS_LABEL[current?.status ?? "free"]}</Chip>
                      </div>
                      <p className="text-sm text-ink-3">
                        {BOOTH_SIZE_LABEL[booth.size]} · {ROOM_NAME[booth.room]}
                        {booth.note ? ` · ${booth.note}` : ""}
                      </p>
                      {current && (
                        <p className="text-sm text-ink-3">
                          Updated {relativeTime(current.updatedAt)}
                          {current.updatedBy ? ` by ${current.updatedBy}` : ""}
                        </p>
                      )}
                    </div>

                    <Field
                      id="booth-status"
                      as="div"
                      label="Status"
                      hint={draft.status === "reserved" ? "On hold: the public map shows it as reserved, without the company's name." : "Confirmed: the company's name shows on the public map."}
                      error={err("status")}
                    >
                      <div className="flex gap-2" role="group" aria-label="Status" aria-describedby="booth-status-hint">
                        {(["sold", "reserved"] as const).map((s) => (
                          <button
                            key={s}
                            type="button"
                            onClick={() => set("status", s)}
                            aria-pressed={draft.status === s}
                            className={cx(
                              "inline-flex min-h-11 items-center gap-2 rounded-md border px-4 text-sm transition-colors duration-150",
                              draft.status === s ? "border-blue font-semibold text-blue ring-1 ring-blue" : "border-line-strong text-ink-2 hover:bg-subtle"
                            )}
                          >
                            <span aria-hidden="true" className="h-2 w-2 rounded-full" style={{ background: STATUS_DOT[s] }} />
                            {STATUS_LABEL[s]}
                          </button>
                        ))}
                      </div>
                    </Field>

                    <Field id="booth-company" label={draft.status === "reserved" ? "Reserved for" : "Company"} required error={err("companyName")}>
                      <input
                        id="booth-company"
                        className={inputClass(!!err("companyName"))}
                        value={draft.companyName}
                        onChange={(e) => set("companyName", e.target.value)}
                        maxLength={LIMITS.companyName}
                        {...aria("booth-company", err("companyName"))}
                      />
                    </Field>
                    <Field id="booth-sector" label="Sector" optionalLabel="optional" hint="Shown under the name in search, such as Earth observation." error={err("sector")}>
                      <input
                        id="booth-sector"
                        className={inputClass(!!err("sector"))}
                        value={draft.sector}
                        onChange={(e) => set("sector", e.target.value)}
                        maxLength={LIMITS.sector}
                        {...aria("booth-sector", err("sector"), true)}
                      />
                    </Field>
                    <Field id="booth-website" label="Website" optionalLabel="optional" hint="Linked from the route card." error={err("website")}>
                      <input
                        id="booth-website"
                        type="url"
                        inputMode="url"
                        autoCapitalize="none"
                        spellCheck={false}
                        className={inputClass(!!err("website"))}
                        value={draft.website}
                        onChange={(e) => set("website", e.target.value)}
                        maxLength={LIMITS.url}
                        {...aria("booth-website", err("website"), true)}
                      />
                    </Field>

                    {saveError && <Alert tone="error">{saveError}</Alert>}
                    {notice && !dirty && (
                      <Alert tone="success">
                        {notice}{" "}
                        <Link href={`/venue?to=${booth.code}`} target="_blank" className={linkClass}>
                          See it on the map
                        </Link>
                      </Alert>
                    )}

                    <div className="flex flex-wrap gap-2">
                      <Button type="submit" variant="primary" loading={saving === "save"} disabled={saving !== null || !dirty}>
                        {saving === "save" ? "Saving" : "Save"}
                      </Button>
                      {dirty && (
                        <Button variant="ghost" onClick={() => setDraft(draftOf(current))} disabled={saving !== null}>
                          Undo changes
                        </Button>
                      )}
                      {current && !dirty && (
                        <Button variant="danger" onClick={free} loading={saving === "free"} disabled={saving !== null}>
                          Free this booth
                        </Button>
                      )}
                    </div>
                  </form>
                )}
              </Card>
            </div>
          </div>

          <Card>
            <div className="flex flex-wrap items-center gap-3 border-b border-line p-4 sm:px-5">
              <div className="flex flex-wrap gap-2" role="group" aria-label="Show">
                {(
                  [
                    ["all", `All (${BOOTHS.length})`],
                    ["sold", `Sold (${counts.sold})`],
                    ["reserved", `Reserved (${counts.reserved})`],
                    ["free", `Free (${counts.free})`],
                  ] as [Show, string][]
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={show === value}
                    onClick={() => setShow(value)}
                    className={cx(
                      "min-h-9 rounded-md border px-3 text-sm font-semibold transition-colors duration-150 pointer-coarse:min-h-11",
                      show === value ? "border-blue bg-blue text-white" : "border-line-strong bg-surface text-ink-2 hover:bg-subtle hover:text-ink active:bg-line"
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <label className="relative ml-auto w-full sm:w-72">
                <span className="sr-only">Search booths</span>
                <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" />
                <input className={inputClass(false, "pl-9")} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Booth, company or room" />
              </label>
            </div>
            {rows.length === 0 ? (
              <p className="p-5 text-sm text-ink-3">{query ? `No booth matches “${query}”.` : "No booths here."}</p>
            ) : (
              <ul className="grid gap-px bg-line sm:grid-cols-2 xl:grid-cols-3">
                {rows.map((b) => {
                  const a = assignments.get(b.code);
                  return (
                    <li key={b.code} className="bg-surface">
                      <button
                        type="button"
                        onClick={() => select(b.code, true)}
                        aria-current={b.code === selected ? "true" : undefined}
                        className={cx(
                          "grid min-h-14 w-full grid-cols-[4rem_1fr_auto] items-center gap-4 px-4 py-3 text-left transition-colors duration-150 hover:bg-subtle sm:px-5",
                          b.code === selected && "bg-subtle"
                        )}
                      >
                        <span className="rounded-sm py-1 text-center text-xs font-bold tabular-nums text-white" style={{ background: BOOTH_FILL[b.size] }}>
                          {b.code}
                        </span>
                        <span className="min-w-0">
                          <span className={cx("flex flex-wrap items-center gap-x-2 text-sm font-semibold", a ? "text-ink" : "text-ink-3")}>
                            {a ? a.companyName : "Free"}
                            {a?.status === "reserved" && <Chip dot={STATUS_DOT.reserved}>Reserved</Chip>}
                          </span>
                          <span className="block text-sm text-ink-3">
                            {[a?.sector, BOOTH_SIZE_LABEL[b.size], ROOM_NAME[b.room]].filter(Boolean).join(" · ")}
                          </span>
                        </span>
                        <span className="text-sm font-semibold text-blue">{a ? "Edit" : "Assign"}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </>
      )}
    </AdminPage>
    </div>
  );
}
