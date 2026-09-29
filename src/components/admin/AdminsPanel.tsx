"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { AdminPage, Button, Card, cx, ErrorState, LoadingLabel, PageHeader, Skeleton } from "@/components/ui";
import { useAdmin } from "@/components/admin/AdminContext";

// /admin/admins: who can use the admin. Access today is by two shared
// codes set on the server; this page shows whether each is set, what it
// unlocks, and this device's access.

interface Security {
  staffCode: boolean;
  adminCode: boolean;
}

export default function AdminsPanel() {
  const { apiCall, adminCode, signOut } = useAdmin();
  const [security, setSecurity] = useState<Security | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(
    () =>
      apiCall("/api/admin/settings").then(
        (json) => setSecurity((json.status as { security: Security }).security),
        (err) => setError(err instanceof Error ? err.message : "Couldn't load access settings.")
      ),
    [apiCall]
  );

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once
  }, []);

  return (
    <AdminPage width="max-w-4xl">
      <PageHeader eyebrow="Admins" title="Admins" description="Who can open the admin and the check-in scanner, and how." />

      {!security ? (
        error ? (
          <ErrorState
            title="Couldn't load access settings"
            message={error}
            onRetry={() => {
              setError("");
              load();
            }}
          />
        ) : (
          <Card className="space-y-4 p-5 sm:p-6">
            <LoadingLabel>Loading access settings</LoadingLabel>
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </Card>
        )
      ) : (
        <>
          <Card className="p-5 sm:p-6">
            <h2 className="font-display text-xl font-bold text-blue">Access codes</h2>
            <p className="mt-1 text-sm text-ink-3">Everyone working the event signs in with a shared code, once on each device.</p>
            <dl className="mt-4 divide-y divide-line border-y border-line">
              <CodeRow
                name="Staff code"
                set={security.staffCode}
                unlocks="Opens the dashboard, walk-in registration and the check-in scanner. Give it to everyone working the event."
                missing="Not set: anyone with the link can open the admin. Set STAFF_ACCESS_CODE on the server."
              />
              <CodeRow
                name="Admin code"
                set={security.adminCode}
                unlocks="Also needed to change ticket prices and settings. Keep it to the organisers."
                missing="Not set: anyone with the staff code can change prices and settings. Set ADMIN_ACCESS_CODE on the server."
              />
            </dl>
            <p className="mt-4 text-sm text-ink-3">
              The codes are set on the server. After a code changes, everyone using the old one is asked to sign in again.
              Ask your developer to change them.
            </p>
          </Card>

          <Card className="flex flex-wrap items-center justify-between gap-4 p-5 sm:p-6">
            <div className="space-y-1">
              <h2 className="font-display text-xl font-bold text-blue">This device</h2>
              <p className="text-sm text-ink-2">
                Signed in with the staff code.{" "}
                {security.adminCode && (adminCode ? "Admin code entered for this session." : "Admin code not entered yet.")}
              </p>
            </div>
            <Button variant="danger" onClick={signOut}>
              Sign out of this device
            </Button>
          </Card>
        </>
      )}
    </AdminPage>
  );
}

function CodeRow({ name, set, unlocks, missing }: { name: string; set: boolean; unlocks: string; missing: string }) {
  return (
    <div className="grid gap-2 py-4 sm:grid-cols-[10rem_1fr] sm:gap-4">
      <dt className="flex items-center gap-2 text-sm font-semibold text-ink">
        <span aria-hidden="true" className={cx("h-2 w-2 rounded-full", set ? "bg-success" : "bg-danger")} />
        {name}
      </dt>
      <dd className="space-y-1 text-sm">
        <Status set={set} />
        <p className="text-ink-2">{set ? unlocks : missing}</p>
      </dd>
    </div>
  );
}

function Status({ set }: { set: boolean }): ReactNode {
  return <p className={cx("font-semibold", set ? "text-success" : "text-danger")}>{set ? "Set" : "Not set"}</p>;
}
