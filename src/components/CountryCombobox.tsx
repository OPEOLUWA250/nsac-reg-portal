"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { cx, inputClass } from "@/components/ui";
import { IconCheck, IconChevronDown } from "@/components/icons";

// A country picker you can type into: the list narrows as you type (accents
// optional, so "senegal" finds "Sénégal"), and the arrow opens the full list.
// Follows the ARIA combobox pattern: arrows move, Enter picks, Escape closes.

export interface CountryOption {
  code: string;
  name: string;
}

function fold(text: string) {
  return text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();
}

export default function CountryCombobox({
  id,
  value,
  onChange,
  options,
  placeholder,
  noMatch,
  invalid,
  describedBy,
  autoComplete,
}: {
  id: string;
  value: string;
  onChange: (code: string) => void;
  options: CountryOption[];
  placeholder: string;
  /** Shown when nothing matches, e.g. (q) => `No country matches "${q}"`. */
  noMatch: (query: string) => string;
  invalid?: boolean;
  describedBy?: string;
  autoComplete?: string;
}) {
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const selectedName = options.find((o) => o.code === value)?.name ?? "";
  const [open, setOpen] = useState(false);
  // null = not typing: the box shows the chosen country's name.
  const [query, setQuery] = useState<string | null>(null);
  const [active, setActive] = useState(0);

  const text = query ?? selectedName;

  const matches = useMemo(() => {
    if (query === null || !query.trim()) return options;
    const q = fold(query);
    const starts: CountryOption[] = [];
    const contains: CountryOption[] = [];
    for (const o of options) {
      const name = fold(o.name);
      if (name.startsWith(q) || o.code.toLowerCase() === q) starts.push(o);
      else if (name.includes(q)) contains.push(o);
    }
    return [...starts, ...contains];
  }, [options, query]);

  // Keep the highlighted option in view.
  useEffect(() => {
    if (!open) return;
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  function openList() {
    const i = matches.findIndex((o) => o.code === value);
    setActive(i >= 0 ? i : 0);
    setOpen(true);
  }

  function choose(o: CountryOption) {
    onChange(o.code);
    setQuery(null);
    setOpen(false);
  }

  function close() {
    setOpen(false);
    // A typed name that matches a country exactly counts as choosing it
    // (also covers the browser's autofill); anything else is dropped.
    if (query !== null) {
      const exact = options.find((o) => fold(o.name) === fold(query));
      if (exact) onChange(exact.code);
      else if (!query.trim()) onChange("");
    }
    setQuery(null);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        if (!open) openList();
        else setActive((i) => Math.min(i + 1, matches.length - 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        if (!open) openList();
        else setActive((i) => Math.max(i - 1, 0));
        break;
      case "Home":
        if (open) {
          e.preventDefault();
          setActive(0);
        }
        break;
      case "End":
        if (open) {
          e.preventDefault();
          setActive(matches.length - 1);
        }
        break;
      case "Enter":
        if (open && matches[active]) {
          e.preventDefault();
          choose(matches[active]);
        }
        break;
      case "Escape":
        if (open || query !== null) {
          e.preventDefault();
          setOpen(false);
          setQuery(null);
        }
        break;
    }
  }

  return (
    <div className="relative">
      <input
        ref={inputRef}
        id={id}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && matches[active] ? `${listId}-${matches[active].code}` : undefined}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        autoComplete={autoComplete ?? "off"}
        spellCheck={false}
        placeholder={placeholder}
        value={text}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onFocus={(e) => e.target.select()}
        onClick={() => !open && openList()}
        onKeyDown={onKeyDown}
        onBlur={close}
        className={inputClass(!!invalid, "pr-11")}
      />
      <button
        type="button"
        tabIndex={-1}
        aria-hidden="true"
        onMouseDown={(e) => {
          // Keep focus in the input.
          e.preventDefault();
          inputRef.current?.focus();
          if (open) setOpen(false);
          else openList();
        }}
        className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-md text-ink-3 transition-colors duration-150 hover:text-ink"
      >
        <IconChevronDown className={cx("h-5 w-5 transition-transform duration-150", open && "rotate-180")} />
      </button>

      {open && (
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          aria-label={placeholder}
          className="absolute inset-x-0 top-full z-20 mt-1 max-h-64 overflow-y-auto rounded-lg border border-line bg-surface py-1 transition-opacity duration-150 starting:opacity-0"
        >
          {matches.length === 0 ? (
            <li className="px-4 py-3 text-sm text-ink-3">{noMatch(query ?? "")}</li>
          ) : (
            matches.map((o, i) => {
              const selected = o.code === value;
              return (
                <li
                  key={o.code}
                  id={`${listId}-${o.code}`}
                  role="option"
                  aria-selected={selected}
                  data-index={i}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    choose(o);
                  }}
                  onMouseMove={() => i !== active && setActive(i)}
                  className={cx(
                    "flex min-h-11 cursor-pointer items-center justify-between gap-3 px-4 text-base",
                    i === active ? "bg-subtle text-blue" : "text-ink",
                    selected && "font-semibold"
                  )}
                >
                  {o.name}
                  {selected && <IconCheck className="h-4 w-4 shrink-0 text-blue" />}
                </li>
              );
            })
          )}
        </ul>
      )}
    </div>
  );
}
