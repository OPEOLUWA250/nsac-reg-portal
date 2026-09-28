"use client";

import { useState } from "react";
import QrScanner from "@/components/QrScanner";
import Badge from "@/components/Badge";
import StaffGate, { useStaffCode } from "@/components/StaffGate";
import StationGate, { useStationName } from "@/components/StationGate";
import { Button, Card, Kicker, RolePill } from "@/components/ui";
import type { Attendee } from "@/lib/types";

type Status = "scanning" | "loading" | "found" | "error";

// Rendered client-only (see src/app/checkin/page.tsx, ssr: false) so it's
// safe to read localStorage directly in the initial state — there's no
// server render to mismatch against.
export default function CheckInApp() {
  const { staffCode, saveStaffCode } = useStaffCode();
  const { stationName, setStationName, clearStationName } = useStationName();
  const [status, setStatus] = useState<Status>("scanning");
  const [attendee, setAttendee] = useState<Attendee | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [alreadyCheckedIn, setAlreadyCheckedIn] = useState(false);
  const [checkingIn, setCheckingIn] = useState(false);

  async function apiCall(path: string, body: unknown) {
    const res = await fetch(path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-staff-code": staffCode ?? "",
      },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error ?? `Request failed (${res.status})`);
    return json;
  }

  async function handleScan(token: string) {
    if (status === "loading" || status === "found") return;
    setStatus("loading");
    try {
      const { attendee } = await apiCall("/api/checkin/lookup", { token });
      setAttendee(attendee);
      setAlreadyCheckedIn(attendee.checked_in);
      setStatus("found");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Lookup failed");
      setStatus("error");
    }
  }

  function reset() {
    setAttendee(null);
    setAlreadyCheckedIn(false);
    setErrorMsg("");
    setStatus("scanning");
  }

  // The primary action for a not-yet-checked-in attendee: confirm and print
  // are merged into one tap so a badge can never be printed without the
  // check-in being recorded, while still keeping the human verification
  // step (staff read the name/role on screen before tapping).
  async function handleConfirmAndPrint() {
    if (!attendee) return;
    setCheckingIn(true);
    try {
      const result = await apiCall("/api/checkin/confirm", {
        token: attendee.unique_code,
        station: stationName,
      });
      setAlreadyCheckedIn(false);
      if (result.attendee) setAttendee(result.attendee);
      window.print();
      try {
        await apiCall("/api/checkin/badge-printed", {
          token: attendee.unique_code,
        });
      } catch {
        // non-critical — printing already happened
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Check-in failed");
    } finally {
      setCheckingIn(false);
    }
  }

  // For attendees already checked in — reprint only, no state change.
  async function handlePrintBadge() {
    if (!attendee) return;
    window.print();
    try {
      await apiCall("/api/checkin/badge-printed", {
        token: attendee.unique_code,
      });
    } catch {
      // non-critical — printing already happened
    }
  }

  if (!staffCode) {
    return <StaffGate onSubmit={saveStaffCode} />;
  }

  if (!stationName) {
    return <StationGate onSubmit={setStationName} />;
  }

  return (
    <main className="flex-1 p-6 sm:p-10 brand-glow">
      <div className="max-w-md mx-auto space-y-6">
        <div className="text-center space-y-1.5">
          <Kicker>Event Day</Kicker>
          <h1 className="font-display text-2xl text-navy">Check-in Scanner</h1>
          <button
            onClick={clearStationName}
            className="text-xs text-navy/45 hover:text-navy/70 transition-colors"
          >
            📍 {stationName} · Change
          </button>
        </div>

        {status !== "found" && (
          <div className="space-y-3">
            <QrScanner onScan={handleScan} paused={status === "loading"} />
            <p className="text-center text-sm text-navy/50">
              Point the camera at an attendee&apos;s QR code
            </p>
          </div>
        )}

        {status === "error" && (
          <Card className="p-6 text-center space-y-4">
            <p className="text-red-600 text-sm">{errorMsg}</p>
            <Button variant="outline" onClick={reset}>
              Try again
            </Button>
          </Card>
        )}

        {status === "found" && attendee && (
          <Card className="p-6 space-y-5">
            <div className="space-y-1.5">
              <RolePill role={attendee.role} />
              <div className="font-display text-2xl text-navy pt-1">
                {attendee.full_name}
              </div>
              {attendee.organization && (
                <div className="text-navy/55 text-sm">{attendee.organization}</div>
              )}
            </div>

            {attendee.payment_status === "pending" && (
              <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                Payment not completed for this registration. Send them to the help desk.
              </p>
            )}

            {alreadyCheckedIn && (
              <p className="text-sm text-gold bg-gold/10 border border-gold/30 rounded-lg px-3 py-2">
                Already checked in previously. You can still print another badge.
              </p>
            )}

            <div className="flex flex-col gap-2.5">
              {!alreadyCheckedIn ? (
                <Button
                  variant="gold"
                  onClick={handleConfirmAndPrint}
                  disabled={checkingIn}
                >
                  {checkingIn ? "Checking in..." : "Confirm check-in & print badge"}
                </Button>
              ) : (
                <Button variant="gold" onClick={handlePrintBadge}>
                  Print badge
                </Button>
              )}

              <Button variant="ghost" className="!px-0" onClick={reset}>
                Scan next attendee
              </Button>
            </div>

            {errorMsg && <p className="text-red-600 text-sm">{errorMsg}</p>}
          </Card>
        )}
      </div>

      {attendee && <Badge attendee={attendee} />}
    </main>
  );
}
