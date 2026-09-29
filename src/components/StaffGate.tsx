"use client";

import { useState, useSyncExternalStore } from "react";
import { Alert, Button, Card, Eyebrow, Field, inputClass } from "@/components/ui";

export const STAFF_CODE_KEY = "nsac_staff_code";
const CHANGE_EVENT = "nsac-staff-code";

// The staff code lives in this browser's localStorage. Every component that
// reads it (header, admin, scanner) stays in sync through this store.

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

function readStaffCode(): string | null {
  try {
    return localStorage.getItem(STAFF_CODE_KEY);
  } catch {
    return null;
  }
}

export function saveStaffCode(code: string) {
  try {
    localStorage.setItem(STAFF_CODE_KEY, code.trim());
  } catch {
    /* storage blocked: the code only lasts for this page */
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function clearStaffCode() {
  try {
    localStorage.removeItem(STAFF_CODE_KEY);
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function useStaffCode() {
  const staffCode = useSyncExternalStore(subscribe, readStaffCode, () => null);
  return { staffCode, saveStaffCode, clearStaffCode };
}

export default function StaffGate({ onSubmit }: { onSubmit: (code: string) => void }) {
  const [code, setCode] = useState("");
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");

  // Checks the code with the server before saving it, so a typo shows up
  // here rather than as a failed request on the next screen.
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = code.trim();
    if (!trimmed) {
      setError("Enter the access code.");
      return;
    }
    setChecking(true);
    setError("");
    try {
      const res = await fetch("/api/staff/verify", {
        method: "POST",
        headers: { "x-staff-code": trimmed },
        signal: AbortSignal.timeout(15_000),
      });
      if (res.status === 401) {
        setError("That code isn't right. Check it with the event team and try again.");
        return;
      }
      if (!res.ok) throw new Error(String(res.status));
      onSubmit(trimmed);
    } catch {
      setError("Couldn't check the code. Check your connection and try again.");
    } finally {
      setChecking(false);
    }
  }

  return (
    <main id="main" className="flex-1 flex items-center justify-center px-4 py-12">
      <Card className="w-full max-w-sm p-6 sm:p-8">
        <form onSubmit={handleSubmit} noValidate className="space-y-5">
          <div className="space-y-2">
            <Eyebrow>Staff access</Eyebrow>
            <h1 className="font-display text-2xl font-extrabold text-blue">Enter your access code</h1>
            <p className="text-sm text-ink-3">Needed once on each device to use the scanner and the admin.</p>
          </div>
          <Field id="staff-code" label="Access code" error={error}>
            <input
              id="staff-code"
              type="password"
              autoFocus
              autoComplete="current-password"
              className={inputClass(!!error)}
              value={code}
              onChange={(e) => {
                setCode(e.target.value);
                setError("");
              }}
              aria-invalid={!!error}
              aria-describedby={error ? "staff-code-error" : undefined}
            />
          </Field>
          <Button type="submit" variant="primary" className="w-full" loading={checking}>
            {checking ? "Checking" : "Continue"}
          </Button>
        </form>
      </Card>
    </main>
  );
}

/** Shown in place of a staff screen when the saved code stops working. */
export function StaffCodeRejected() {
  return (
    <Alert
      tone="error"
      title="Your access code no longer works"
      action={
        <Button size="sm" variant="outline" onClick={clearStaffCode}>
          Enter it again
        </Button>
      }
    >
      It may have been changed. Ask the event team for the new code.
    </Alert>
  );
}
