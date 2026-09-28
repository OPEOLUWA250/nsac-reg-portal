"use client";

import { useState } from "react";
import { Button, Card, Kicker } from "@/components/ui";

export const STAFF_CODE_KEY = "nsac_staff_code";

export function useStaffCode() {
  const [staffCode, setStaffCode] = useState<string | null>(() =>
    localStorage.getItem(STAFF_CODE_KEY)
  );

  function saveStaffCode(code: string) {
    const trimmed = code.trim();
    localStorage.setItem(STAFF_CODE_KEY, trimmed);
    setStaffCode(trimmed);
    // Lets the header show the staff links straight away.
    window.dispatchEvent(new Event("nsac-staff-code"));
  }

  return { staffCode, saveStaffCode };
}

export default function StaffGate({
  onSubmit,
}: {
  onSubmit: (code: string) => void;
}) {
  const [codeInput, setCodeInput] = useState("");

  return (
    <main className="flex-1 flex items-center justify-center p-6 brand-glow">
      <Card className="w-full max-w-sm p-8 space-y-5">
        <div className="space-y-1.5">
          <Kicker>Staff access</Kicker>
          <h1 className="font-display text-2xl text-navy">
            Enter your access code
          </h1>
          <p className="text-sm text-navy/55">
            Required once per device to use the scanner and admin tools.
          </p>
        </div>
        <input
          type="password"
          autoFocus
          className="w-full rounded-lg border border-navy/15 px-4 py-2.5 text-navy placeholder:text-navy/35 outline-none focus:border-gold focus:ring-2 focus:ring-gold/25"
          value={codeInput}
          onChange={(e) => setCodeInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onSubmit(codeInput)}
          placeholder="Access code"
        />
        <Button
          variant="gold"
          className="w-full"
          onClick={() => onSubmit(codeInput)}
        >
          Continue
        </Button>
      </Card>
    </main>
  );
}
