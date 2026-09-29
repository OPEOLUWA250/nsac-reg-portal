"use client";

import { useEffect } from "react";
import { setSiteLanguage, type SiteLanguage } from "@/lib/site-language";

/** Puts the header and footer in this page's language. Renders nothing. */
export default function SiteLanguageSync({ lang }: { lang: SiteLanguage }) {
  useEffect(() => {
    setSiteLanguage(lang);
  }, [lang]);
  return null;
}
