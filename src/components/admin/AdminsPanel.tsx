"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { AdminPage, Card, cx, ErrorState, LoadingLabel, PageHeader, Skeleton } from "@/components/ui";
import { useAdmin } from "@/components/admin/AdminContext";

// /admin/admins: who can use the admin and the scanner. The admin has no
// sign-in for now (ADMIN_SIGN_IN_ENABLED in src/lib/staff-auth.ts); the
// check-in scanner is protected by the shared staff code.

interface Security {
  staffCode: boolean;
}

export default function AdminsPanel() {
  const { apiCall } = useAdmin();
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
      <PageHeader eyebrow="Admins" title="Admins" description="Who can open the admin and the check-in scanner." />

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
        <Card className="p-5 sm:p-6">
          <h2 className="font-display text-xl font-bold text-blue">Access</h2>
          <dl className="mt-4 divide-y divide-line border-y border-line">
            <AccessRow
              name="Admin"
              ok={false}
              status="Open: no sign-in yet"
              text="Anyone with the admin's address can open it, see registrations and passports, and change prices and settings. Admin sign-in is being built. Until then, don't share this address."
            />
            <AccessRow
              name="Check-in scanner"
              ok={security.staffCode}
              status={security.staffCode ? "Staff code set" : "Staff code not set"}
              text={
                security.staffCode
                  ? "Staff enter the shared staff code once on each device before scanning."
                  : "Anyone with the scanner's address can use it. Set STAFF_ACCESS_CODE on the server."
              }
            />
          </dl>
        </Card>
      )}
    </AdminPage>
  );
}

function AccessRow({ name, ok, status, text }: { name: string; ok: boolean; status: string; text: string }): ReactNode {
  return (
    <div className="grid gap-2 py-4 sm:grid-cols-[10rem_1fr] sm:gap-4">
      <dt className="flex items-center gap-2 text-sm font-semibold text-ink">
        <span aria-hidden="true" className={cx("h-2 w-2 rounded-full", ok ? "bg-success" : "bg-danger")} />
        {name}
      </dt>
      <dd className="space-y-1 text-sm">
        <p className={cx("font-semibold", ok ? "text-success" : "text-danger")}>{status}</p>
        <p className="text-ink-2">{text}</p>
      </dd>
    </div>
  );
}
