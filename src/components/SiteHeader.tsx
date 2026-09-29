"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ButtonLink, cx } from "@/components/ui";
import { IconClose, IconMenu } from "@/components/icons";
import BrandLogo from "@/components/BrandLogo";
import { useSiteLanguage } from "@/lib/site-language";
import { SITE_COPY } from "@/lib/site-copy";

// Public header. Staff pages (/admin, /checkin) aren't linked from here:
// staff know their addresses, and visitors don't need to see them. The text
// follows the page's language (English or French).

export default function SiteHeader() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const lang = useSiteLanguage();
  const t = SITE_COPY[lang];

  const onForm = pathname === "/" || pathname.startsWith("/register");
  const staffPage = pathname.startsWith("/checkin");
  // The form page, and staff pages, have their own main button.
  const showCta = !onForm && !staffPage;

  // Menu: Escape or a click outside closes it; focus goes into it on open
  // and back to the button on close.
  useEffect(() => {
    if (!open) return;
    panelRef.current?.querySelector<HTMLElement>("a, button")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    const onClick = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!panelRef.current?.contains(t) && !buttonRef.current?.contains(t)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [open]);

  const close = () => setOpen(false);

  const skipLink = (
    <a
      href="#main"
      className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-3 focus:z-50 focus:rounded-md focus:bg-surface focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-ink"
    >
      {t.skip}
    </a>
  );

  // The admin has its own top bar (see AdminShell).
  if (pathname.startsWith("/admin")) return skipLink;

  return (
    <>
    {skipLink}
    <header className="on-dark sticky top-0 z-30 bg-blue">
      <div className={cx("mx-auto flex h-16 items-center justify-between gap-4 px-4 sm:px-6", !staffPage && "max-w-6xl")}>
        <Link href="/" className="shrink-0 rounded-sm" aria-label={t.home}>
          <BrandLogo />
        </Link>

        {showCta && (
          <ButtonLink href={`/?lang=${lang}`} variant="primary" size="sm" className="max-sm:hidden">
            {t.register}
          </ButtonLink>
        )}

        {/* Phones (public pages only; staff pages have their own navigation) */}
        {!staffPage && (
          <button
            ref={buttonRef}
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-controls="mobile-menu"
            className="inline-flex h-11 w-11 items-center justify-center rounded-md text-white transition-colors duration-150 hover:bg-white/10 active:bg-white/15 sm:hidden"
          >
            <span className="sr-only">{open ? t.closeMenu : t.openMenu}</span>
            {open ? <IconClose className="h-6 w-6" /> : <IconMenu className="h-6 w-6" />}
          </button>
        )}
      </div>

      {open && !staffPage && (
        <div
          ref={panelRef}
          id="mobile-menu"
          className="absolute inset-x-0 top-full border-b border-line bg-surface transition-[opacity,translate] duration-200 starting:-translate-y-2 starting:opacity-0 sm:hidden"
          style={{ ["--focus" as string]: "var(--color-blue)" }}
        >
          <nav aria-label="Menu" className="mx-auto max-w-6xl space-y-3 px-4 py-4">
            {showCta && (
              <ButtonLink href={`/?lang=${lang}`} variant="primary" size="lg" className="w-full" onClick={close}>
                {t.register}
              </ButtonLink>
            )}
            <div>
              <MenuLink href={`/?lang=${lang}`} active={onForm} onClick={close}>{t.form}</MenuLink>
              <MenuLink href="/flyer" active={pathname.startsWith("/flyer")} onClick={close}>{t.flyer}</MenuLink>
            </div>
            <div className="border-t border-line pt-3">
              <MenuLink href={`/privacy?lang=${lang}`} active={pathname === "/privacy"} onClick={close}>{t.privacy}</MenuLink>
              <MenuLink href={`/terms?lang=${lang}`} active={pathname === "/terms"} onClick={close}>{t.terms}</MenuLink>
            </div>
          </nav>
        </div>
      )}
    </header>
    </>
  );
}

function MenuLink({ href, active, onClick, children }: { href: string; active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={cx(
        "flex min-h-12 items-center rounded-md px-3 text-base transition-colors duration-150 hover:bg-subtle active:bg-line",
        active ? "bg-subtle font-semibold text-ink" : "text-ink-2"
      )}
    >
      {children}
    </Link>
  );
}
