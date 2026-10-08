"use client";

import { usePathname } from "next/navigation";
import { useSiteLanguage } from "@/lib/site-language";
import { SITE_COPY } from "@/lib/site-copy";

export default function SiteFooter() {
  // Staff pages (admin, scanner) are work screens: no footer.
  const pathname = usePathname();
  const lang = useSiteLanguage();
  const t = SITE_COPY[lang];
  if (pathname.startsWith("/admin") || pathname.startsWith("/checkin")) return null;

  // Organisers on the left, the host at the far right; stacked on phones.
  // Privacy and Terms are linked from the form's consent text and the menu.
  return (
    <footer className="border-t border-line bg-canvas">
      <div className="mx-auto flex max-w-6xl flex-col gap-5 px-4 py-6 text-sm sm:flex-row sm:items-center sm:justify-between sm:px-6 sm:py-5">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
          <span className="w-full text-ink-3 sm:w-auto">{t.organisedBy}</span>
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
          {/* eslint-disable-next-line @next/next/no-img-element -- small logo, served as it is */}
          <img src="/brand/partners/2-afsa.png" alt="African Space Agency (AfSA)" width={127} height={40} className="block h-10 w-auto" loading="lazy" />
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3 border-t border-line pt-5 sm:border-0 sm:pt-0">
          <span className="w-full text-ink-3 sm:w-auto">{t.hostedBy}</span>
          {/* eslint-disable-next-line @next/next/no-img-element -- small logo, served as it is */}
          <img
            src="/brand/partners/3-mesri-senegal.png"
            alt="Ministère de l'Enseignement supérieur, de la Recherche et de l'Innovation (MESRI), République du Sénégal"
            width={95}
            height={56}
            className="block h-14 w-auto"
            loading="lazy"
          />
        </div>
      </div>
    </footer>
  );
}
