"use client";

import { useEffect } from "react";
import { clearDraft } from "@/lib/registration-draft";

// Rendered on /register/success once payment is confirmed: forgets the
// half-filled form saved in this browser, so opening the form again starts
// a fresh registration instead of the paid one.
export default function ClearRegistrationDraft() {
  useEffect(() => {
    clearDraft();
  }, []);
  return null;
}
