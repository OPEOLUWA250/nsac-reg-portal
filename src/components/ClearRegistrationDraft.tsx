"use client";

import { useEffect } from "react";
import { REGISTRATION_DRAFT_KEY } from "@/lib/registration-fields";

// Rendered on /register/success once payment is confirmed: forgets the
// half-filled form saved in this tab, so opening /register again starts
// fresh instead of on the payment step with the previous person's answers.
export default function ClearRegistrationDraft() {
  useEffect(() => {
    try {
      sessionStorage.removeItem(REGISTRATION_DRAFT_KEY);
    } catch {
      /* storage unavailable — nothing to clear */
    }
  }, []);
  return null;
}
