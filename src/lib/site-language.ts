"use client";

import { useSyncExternalStore } from "react";

// The language the visitor is reading the site in, shared by the pages
// that have a language switch (form, flyer, legal pages) and the header
// and footer, which follow it. The choice is remembered in this browser.

export type SiteLanguage = "en" | "fr";

export const LANG_KEY = "nsac_lang";
const CHANGE_EVENT = "nsac-lang";

// Language of the page on screen (set by the page), before any saved choice.
let current: SiteLanguage | null = null;

function saved(): SiteLanguage | null {
  try {
    const v = localStorage.getItem(LANG_KEY);
    return v === "en" || v === "fr" ? v : null;
  } catch {
    return null;
  }
}

/** Saved choice, else the browser's language. */
export function preferredLanguage(): SiteLanguage {
  return saved() ?? (navigator.language?.toLowerCase().startsWith("fr") ? "fr" : "en");
}

function read(): SiteLanguage {
  return current ?? preferredLanguage();
}

function subscribe(onChange: () => void) {
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/**
 * Tells the header and footer which language the page is in. `remember`
 * also saves it as the visitor's choice (when they pressed EN / FR).
 */
export function setSiteLanguage(lang: SiteLanguage, { remember = false } = {}) {
  current = lang;
  document.documentElement.lang = lang;
  if (remember) {
    try {
      localStorage.setItem(LANG_KEY, lang);
    } catch {
      /* storage blocked: the choice lasts for this page only */
    }
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

/** The site's language; English while the page is first drawn on the server. */
export function useSiteLanguage(): SiteLanguage {
  return useSyncExternalStore(subscribe, read, () => "en");
}
