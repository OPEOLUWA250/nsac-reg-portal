import Link from "next/link";
import { Kicker } from "@/components/ui";
import HeroBackground from "@/components/HeroBackground";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

async function getStats() {
  try {
    const supabase = supabaseAdmin();
    const [{ count: total }, { count: checkedIn }] = await Promise.all([
      supabase.from("attendees").select("*", { count: "exact", head: true }),
      supabase
        .from("attendees")
        .select("*", { count: "exact", head: true })
        .eq("checked_in", true),
    ]);
    return { total: total ?? 0, checkedIn: checkedIn ?? 0 };
  } catch {
    return null;
  }
}

export default async function Home() {
  const stats = await getStats();

  return (
    <main className="flex-1 flex items-center justify-center relative overflow-hidden px-6 py-16 bg-blue-3">
      <HeroBackground />

      <div className="relative text-center space-y-7 max-w-2xl">
        <Kicker className="block">Registration Portal</Kicker>
        <h1 className="font-display text-4xl sm:text-6xl text-white leading-[1.05] tracking-tight">
          NewSpace Africa
          <br />
          <span style={{ color: "var(--gold-light)" }}>Conference</span>
        </h1>
        <p className="max-w-md mx-auto text-white/65 text-base sm:text-lg">
          QR-based check-in and on-site badge printing for speakers,
          delegates, hosts, and staff.
        </p>
        <Link
          href="/checkin"
          className="inline-flex rounded-full bg-gold text-navy px-8 py-3.5 text-sm font-semibold tracking-wide hover:bg-gold-light transition-colors"
        >
          Open check-in scanner
        </Link>

        {stats && (
          <div className="flex items-center justify-center gap-10 sm:gap-14 pt-8 mt-2 border-t border-white/10">
            <div className="text-center">
              <div className="font-display text-3xl sm:text-4xl text-white">
                {stats.total.toLocaleString()}
              </div>
              <div className="text-[11px] uppercase tracking-[0.18em] text-white/45 mt-1">
                Registered
              </div>
            </div>
            <div className="h-10 w-px bg-white/15" />
            <div className="text-center">
              <div
                className="font-display text-3xl sm:text-4xl"
                style={{ color: "var(--gold-light)" }}
              >
                {stats.checkedIn.toLocaleString()}
              </div>
              <div className="text-[11px] uppercase tracking-[0.18em] text-white/45 mt-1">
                Checked In
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
