import Link from "next/link";
import { headers } from "next/headers";
import type { ReactNode } from "react";
import { cx, Eyebrow } from "@/components/ui";
import SiteLanguageSync from "@/components/SiteLanguageSync";
import { EVENT_INFO } from "@/lib/event-info";
import type { SiteLanguage } from "@/lib/site-language";

// Shared layout for /privacy and /terms: one readable column, in English
// or French.

/** ?lang= from the link (the form passes it), else the browser's language. */
export async function legalLanguage(searchParams: Promise<Record<string, string | string[] | undefined>>): Promise<SiteLanguage> {
  const { lang } = await searchParams;
  if (lang === "fr" || lang === "en") return lang;
  const accept = (await headers()).get("accept-language") ?? "";
  return accept.toLowerCase().startsWith("fr") ? "fr" : "en";
}

export default function LegalPage({
  lang,
  path,
  title,
  intro,
  children,
}: {
  lang: SiteLanguage;
  /** This page's path, for the language switch. */
  path: string;
  title: string;
  intro: ReactNode;
  children: ReactNode;
}) {
  return (
    <main id="main" lang={lang} className="flex-1 px-4 py-8 sm:px-6 sm:py-12">
      <SiteLanguageSync lang={lang} />
      <article className="mx-auto max-w-prose space-y-8">
        <header className="space-y-3">
          <div className="flex flex-wrap-reverse items-end justify-between gap-4">
            <div className="min-w-0 flex-1 basis-48 space-y-2">
              <Eyebrow>{EVENT_INFO.name[lang]}</Eyebrow>
              <h1 className="font-display text-3xl font-extrabold wrap-break-word text-blue">{title}</h1>
            </div>
            <LanguageLinks lang={lang} path={path} />
          </div>
          <div className="text-base text-ink-2">{intro}</div>
        </header>
        {children}
      </article>
    </main>
  );
}

export function LegalSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3 border-t border-line pt-6">
      <h2 className="font-display text-xl font-bold text-blue">{title}</h2>
      <div className="space-y-3 text-base leading-relaxed text-ink-2 [&_li]:ml-5 [&_li]:list-disc [&_ul]:space-y-1.5">
        {children}
      </div>
    </section>
  );
}

// The same look as the form's EN / FR switch, as links (the page is
// rendered on the server).
function LanguageLinks({ lang, path }: { lang: SiteLanguage; path: string }) {
  return (
    <nav aria-label="Language / Langue" className="inline-flex shrink-0 rounded-md border border-line-strong bg-surface p-0.5">
      {(["en", "fr"] as const).map((l) => (
        <Link
          key={l}
          href={`${path}?lang=${l}`}
          lang={l}
          hrefLang={l}
          aria-current={lang === l ? "page" : undefined}
          aria-label={l === "en" ? "English" : "Français"}
          className={cx(
            "inline-flex min-h-9 min-w-11 items-center justify-center rounded-sm px-3 text-xs font-semibold uppercase tracking-wider transition-colors duration-150 pointer-coarse:min-h-11",
            lang === l ? "bg-blue text-white" : "text-ink-2 hover:bg-subtle hover:text-ink"
          )}
        >
          {l}
        </Link>
      ))}
    </nav>
  );
}
