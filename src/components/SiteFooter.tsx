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

  // Organisers on the left, the host at the far right, on one row at every
  // width: on phones each label sits above its logos, which are smaller (they
  // fit side by side down to 320 px).
  // Privacy and Terms are linked from the form's consent text and the menu.
  return (
    <footer className="border-t border-line bg-canvas">
      <div className="mx-auto flex max-w-6xl items-start justify-between gap-4 px-4 py-5 text-sm sm:items-center sm:px-6">
        <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
          <span className="text-ink-3">{t.organisedBy}</span>
          <div className="flex items-center gap-2.5 sm:gap-4">
            <a href="https://spaceinafrica.com" className="shrink-0 rounded-sm transition-opacity duration-150 hover:opacity-80" title={t.organiserSite}>
              {/* eslint-disable-next-line @next/next/no-img-element -- pre-sized 2x/3x files, served as they are */}
              <img
                src="/brand/space-in-africa-80.png"
                srcSet="/brand/space-in-africa-80.png 2x, /brand/space-in-africa-120.png 3x"
                alt="Space in Africa"
                width={103}
                height={40}
                className="block h-7 w-auto sm:h-10"
                loading="lazy"
              />
            </a>
            {/* eslint-disable-next-line @next/next/no-img-element -- small logo, served as it is */}
            <img src="/brand/partners/2-afsa.png" alt="African Space Agency (AfSA)" width={127} height={40} className="block h-7 w-auto shrink-0 sm:h-10" loading="lazy" />
          </div>
        </div>
        <div className="flex shrink-0 flex-col gap-2 border-l border-line pl-4 sm:flex-row sm:items-center sm:gap-4 sm:border-0 sm:pl-0">
          <span className="text-ink-3">{t.hostedBy}</span>
          {/* eslint-disable-next-line @next/next/no-img-element -- small logo, served as it is */}
          <img
            src="/brand/partners/3-mesri-senegal.png"
            alt="Ministère de l'Enseignement supérieur, de la Recherche et de l'Innovation (MESRI), République du Sénégal"
            width={95}
            height={56}
            className="block h-9 w-auto sm:h-14"
            loading="lazy"
          />
        </div>
      </div>
    </footer>
  );
}
