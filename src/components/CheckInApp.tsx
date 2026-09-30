"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import QrScanner from "@/components/QrScanner";
import Badge from "@/components/Badge";
import StationGate, { useStationName } from "@/components/StationGate";
import { Alert, Button, Card, Eyebrow, RolePill, Spinner } from "@/components/ui";
import { IconAlert, IconPin } from "@/components/icons";
import type { Attendee } from "@/lib/types";
import { roleLabel } from "@/lib/role-style";

type Status = "scanning" | "loading" | "found" | "error";

// Plain-language messages for what the check-in API can answer.
async function apiError(res: Response): Promise<Error & { status: number }> {
  const json = await res.json().catch(() => ({}));
  const message =
    res.status === 404
      ? "This QR code doesn't match any registration. Check it's a NewSpace Africa 2027 ticket, or send them to the help desk."
      : res.status === 401
        ? "Your sign-in has ended. Sign in again to use the scanner."
        : res.status >= 500
          ? "The server had a problem. Try again in a moment."
          : (json.error ?? `Request failed (${res.status})`);
  return Object.assign(new Error(message), { status: res.status });
}

// Rendered client-only (see src/app/checkin/page.tsx, ssr: false) so it's
// safe to read localStorage directly in the initial state — there's no
// server render to mismatch against.
export default function CheckInApp() {
  const router = useRouter();
  const { stationName, setStationName, clearStationName } = useStationName();
  const [status, setStatus] = useState<Status>("scanning");
  const [attendee, setAttendee] = useState<Attendee | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [alreadyCheckedIn, setAlreadyCheckedIn] = useState(false);
  const [checkingIn, setCheckingIn] = useState(false);
  const [done, setDone] = useState(false);

  async function apiCall(path: string, body: unknown) {
    let res: Response;
    try {
      res = await fetch(path, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(20_000),
      });
    } catch {
      throw new Error("Couldn't reach the server. Check the Wi-Fi or mobile data and try again.");
    }
    if (!res.ok) {
      const err = await apiError(res);
      if (err.status === 401) router.replace("/admin/login?next=/checkin");
      if (err.status === 403) router.replace("/admin/reset-password");
      throw err;
    }
    return res.json();
  }

  async function handleScan(token: string) {
    if (status === "loading" || status === "found") return;
    setStatus("loading");
    try {
      const { attendee } = await apiCall("/api/checkin/lookup", { token });
      setAttendee(attendee);
      setAlreadyCheckedIn(attendee.checked_in);
      setDone(false);
      setErrorMsg("");
      setStatus("found");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Lookup failed.");
      setStatus("error");
    }
  }

  function reset() {
    setAttendee(null);
    setAlreadyCheckedIn(false);
    setErrorMsg("");
    setDone(false);
    setStatus("scanning");
  }

  // The primary action for a not-yet-checked-in attendee: confirm and print
  // are merged into one tap so a badge can never be printed without the
  // check-in being recorded, while still keeping the human verification
  // step (staff read the name/role on screen before tapping).
  async function handleConfirmAndPrint() {
    if (!attendee) return;
    setCheckingIn(true);
    setErrorMsg("");
    try {
      const result = await apiCall("/api/checkin/confirm", {
        token: attendee.unique_code,
        station: stationName,
      });
      setAlreadyCheckedIn(false);
      if (result.attendee) setAttendee(result.attendee);
      setDone(true);
      window.print();
      try {
        await apiCall("/api/checkin/badge-printed", {
          token: attendee.unique_code,
        });
      } catch {
        // non-critical — printing already happened
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Check-in failed.");
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

  if (!stationName) {
    return <StationGate onSubmit={setStationName} />;
  }

  return (
    <main id="main" className="flex-1 px-4 py-8 sm:px-6 sm:py-12">
      <div className="mx-auto max-w-md space-y-6">
        <div className="space-y-2 text-center">
          <Eyebrow>Event day</Eyebrow>
          <h1 className="font-display text-3xl font-extrabold text-blue">Check-in scanner</h1>
          <Button variant="ghost" size="sm" onClick={clearStationName} aria-label={`Station: ${stationName}. Change station`}>
            <IconPin />
            {stationName}
            <span className="font-normal text-ink-3">Change</span>
          </Button>
        </div>

        {(status === "scanning" || status === "loading") && (
          <div className="space-y-3">
            <div className="relative">
              <QrScanner onScan={handleScan} paused={status === "loading"} />
              {status === "loading" && (
                <div role="status" className="absolute inset-0 mx-auto flex max-w-sm flex-col items-center justify-center gap-3 rounded-lg bg-surface/95 text-sm font-semibold text-ink">
                  <Spinner className="h-6 w-6" />
                  Looking up the ticket
                </div>
              )}
            </div>
            <p className="text-center text-sm text-ink-3">Point the camera at the attendee&apos;s QR code.</p>
          </div>
        )}

        {status === "error" && (
          <Card role="alert" className="space-y-4 p-6 text-center">
            <IconAlert className="mx-auto h-7 w-7 text-danger" />
            <p className="font-display text-xl font-bold text-blue">Ticket not recognised</p>
            <p className="text-sm text-ink-2">{errorMsg}</p>
            <Button variant="primary" size="lg" className="w-full" onClick={reset}>
              Scan again
            </Button>
          </Card>
        )}

        {status === "found" && attendee && (
          <Card className="space-y-5 p-6 transition-opacity duration-200 starting:opacity-0">
            <div className="space-y-2">
              <RolePill role={attendee.role} />
              <p className="font-display text-3xl font-extrabold text-blue">{attendee.full_name}</p>
              {attendee.organization && <p className="text-ink-2">{attendee.organization}</p>}
            </div>

            <dl className="divide-y divide-line border-y border-line text-sm">
              {[
                ["Name", attendee.full_name],
                ["Country of residence", attendee.residence_country],
                ["Category", roleLabel(attendee.role)],
                ["Nationality", attendee.nationality],
                ["Email", attendee.email],
                ["Phone number", attendee.phone],
                ["Company / organisation", attendee.organization],
                ["Job title", attendee.job_title],
              ].map(([label, value]) => (
                <div key={label} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)] gap-3 py-3">
                  <dt className="text-ink-3">{label}</dt>
                  <dd className="font-medium text-ink [overflow-wrap:anywhere]">{value || "Not provided"}</dd>
                </div>
              ))}
            </dl>
            <p className="text-xs text-ink-3">
              {attendee.share_details === true ? "This attendee allows their contact details to be shared through their QR code." : "This attendee chose not to share their details publicly. These details are visible only to signed-in admins for check-in."}
            </p>

            {attendee.payment_status === "pending" && (
              <Alert tone="error" title="Payment not completed">
                Send them to the help desk before printing a badge.
              </Alert>
            )}

            {done ? (
              <Alert tone="success" title="Checked in">
                The badge is printing. If it didn&apos;t print, use Print badge again.
              </Alert>
            ) : (
              alreadyCheckedIn && (
                <Alert tone="info" title="Already checked in">
                  They checked in earlier. You can still print another badge.
                </Alert>
              )
            )}

            {errorMsg && <Alert tone="error">{errorMsg}</Alert>}

            <div className="flex flex-col gap-2.5">
              {!alreadyCheckedIn && !done ? (
                <Button variant="primary" size="lg" onClick={handleConfirmAndPrint} loading={checkingIn} disabled={attendee.payment_status === "pending"}>
                  {checkingIn ? "Checking in" : "Confirm check-in and print badge"}
                </Button>
              ) : (
                <Button variant="primary" size="lg" onClick={handlePrintBadge} disabled={attendee.payment_status === "pending"}>
                  Print badge
                </Button>
              )}
              <Button variant="outline" size="lg" onClick={reset} disabled={checkingIn}>
                Scan next attendee
              </Button>
            </div>
          </Card>
        )}
      </div>

      {attendee && <Badge attendee={attendee} />}
    </main>
  );
}
