import { Card, Kicker } from "@/components/ui";

// Placeholder: managing who can access the admin comes later. Today access
// is by the shared STAFF_ACCESS_CODE (and ADMIN_ACCESS_CODE for prices and
// settings).
export default function AdminAdminsPage() {
  return (
    <main className="px-4 py-6 sm:px-8 sm:py-10">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="space-y-1">
          <Kicker>Admins</Kicker>
          <h1 className="font-display text-3xl text-navy">Admins</h1>
        </div>
        <Card className="p-10 text-center space-y-3">
          <span className="inline-flex rounded-full bg-gold/15 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-navy">
            Coming soon
          </span>
          <h2 className="font-display text-xl text-navy">Manage who can use the admin</h2>
          <p className="mx-auto max-w-md text-sm text-navy/60">
            Individual admin accounts, roles and an activity log will live here. For now, everyone signs in
            with the shared staff access code.
          </p>
        </Card>
      </div>
    </main>
  );
}
