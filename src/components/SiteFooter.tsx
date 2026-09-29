"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { EVENT_INFO } from "@/lib/event-info";
import { COPY } from "@/lib/registration-copy";
import { useSiteLanguage } from "@/lib/site-language";
import { SITE_COPY } from "@/lib/site-copy";

const linkClass = "inline-flex min-h-11 items-center rounded-sm text-ink-2 underline-offset-2 transition-colors duration-150 hover:text-ink hover:underline";

export default function SiteFooter() {
  // Staff pages (admin, scanner) are work screens: no footer.
  const pathname = usePathname();
  const lang = useSiteLanguage();
  const t = SITE_COPY[lang];
  if (pathname.startsWith("/admin") || pathname.startsWith("/checkin")) return null;

  return (
    <footer className="border-t border-line bg-canvas">
      <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-4 text-sm sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p className="text-ink-3">{t.organisedBy}</p>
        <nav aria-label={lang === "fr" ? "Pied de page" : "Footer"} className="flex flex-wrap gap-x-5">
          <Link href={`/privacy?lang=${lang}`} className={linkClass}>{t.privacy}</Link>
          <Link href={`/terms?lang=${lang}`} className={linkClass}>{t.terms}</Link>
          <a href={`mailto:${COPY[lang].helpEmail}`} className={linkClass}>{t.contact}</a>
          <a href={EVENT_INFO.websiteUrl} className={linkClass}>{t.website}</a>
        </nav>
      </div>
    </footer>
  );
}
