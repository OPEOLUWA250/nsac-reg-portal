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
      {/* Phones: links in a two-column grid (easy to tap), the organiser's
          logo underneath. Wider screens: one row, organiser on the left. */}
      <div className="mx-auto flex max-w-6xl flex-col-reverse gap-4 px-4 py-6 text-sm sm:flex-row sm:items-center sm:justify-between sm:px-6 sm:py-4">
        <div className="flex items-center gap-3 border-t border-line pt-4 sm:border-0 sm:pt-0">
          <span className="text-ink-3">{t.organisedBy}</span>
          <a href="https://spaceinafrica.com" className="rounded-sm transition-opacity duration-150 hover:opacity-80" title={t.organiserSite}>
            {/* eslint-disable-next-line @next/next/no-img-element -- pre-sized 2x/3x files, served as they are */}
            <img
              src="/brand/space-in-africa-80.png"
              srcSet="/brand/space-in-africa-80.png 2x, /brand/space-in-africa-120.png 3x"
              alt="Space in Africa"
              width={103}
              height={40}
              className="block h-10 w-auto"
              loading="lazy"
            />
          </a>
        </div>
        <nav aria-label={lang === "fr" ? "Pied de page" : "Footer"} className="grid grid-cols-2 gap-x-6 sm:flex sm:gap-x-5">
          <Link href={`/privacy?lang=${lang}`} className={linkClass}>{t.privacy}</Link>
          <Link href={`/terms?lang=${lang}`} className={linkClass}>{t.terms}</Link>
          <a href={`mailto:${COPY[lang].helpEmail}`} className={linkClass}>{t.contact}</a>
          <a href={EVENT_INFO.websiteUrl} className={linkClass}>{t.website}</a>
        </nav>
      </div>
    </footer>
  );
}
