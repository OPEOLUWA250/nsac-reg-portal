"use client";

import { REGISTRATION_DRAFT_KEY } from "@/lib/registration-fields";

// The half-filled registration form, kept in this browser (localStorage) so
// the visitor can close the page and carry on later from the same step.
// Cleared once they have paid (/register/success), when they press
// "Start over", and after MAX_AGE_DAYS so answers don't linger on a shared
// computer. The passport file is never kept.

const MAX_AGE_DAYS = 14;

export interface RegistrationDraft {
  form: Record<string, unknown>;
  step: number;
  /** The registration's id, so a return visit continues the same one. */
  id?: string;
  savedAt: number;
}

export function readDraft(): RegistrationDraft | null {
  try {
    const raw = localStorage.getItem(REGISTRATION_DRAFT_KEY);
    if (!raw) return null;
    const draft = JSON.parse(raw) as Partial<RegistrationDraft>;
    const tooOld = !draft.savedAt || Date.now() - draft.savedAt > MAX_AGE_DAYS * 86_400_000;
    if (tooOld || !draft.form) {
      localStorage.removeItem(REGISTRATION_DRAFT_KEY);
      return null;
    }
    return { form: draft.form, step: typeof draft.step === "number" ? draft.step : 0, id: draft.id, savedAt: draft.savedAt! };
  } catch {
    return null; // storage blocked (private mode) or a damaged entry
  }
}

export function saveDraft(draft: Omit<RegistrationDraft, "savedAt">) {
  try {
    localStorage.setItem(REGISTRATION_DRAFT_KEY, JSON.stringify({ ...draft, savedAt: Date.now() }));
  } catch {
    /* storage unavailable: the form still works, it just won't be kept */
  }
}

export function clearDraft() {
  try {
    localStorage.removeItem(REGISTRATION_DRAFT_KEY);
    // Drafts saved by the earlier version of the form lived in the tab only.
    sessionStorage.removeItem(REGISTRATION_DRAFT_KEY);
  } catch {
    /* nothing to clear */
  }
}
