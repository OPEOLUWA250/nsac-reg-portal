import Image from "next/image";
import Link from "next/link";
import StaffOnly from "@/components/StaffOnly";

export default function SiteHeader() {
  return (
    <header
      className="sticky top-0 z-20 border-b border-white/10"
      style={{
        background:
          "linear-gradient(120deg, var(--navy) 0%, var(--blue-2) 60%, var(--blue-1) 100%)",
      }}
    >
      <div className="max-w-6xl mx-auto px-5 sm:px-6 py-2.5 flex items-center justify-between gap-4">
        <Link href="/" className="flex items-center gap-3 shrink-0" aria-label="NewSpace Africa Conference — home">
          <Image
            src="/brand/logo.png"
            alt="NewSpace Africa Conference"
            width={1555}
            height={574}
            priority
            className="h-9 sm:h-10 w-auto"
          />
          <span className="hidden md:inline border-l border-white/20 pl-3 text-white/50 text-[11px] font-semibold uppercase tracking-[0.2em] leading-none">
            Registration Portal
          </span>
        </Link>
        <nav className="flex items-center gap-3.5 sm:gap-5 text-sm">
          {/* Staff tools only appear on devices where the staff code was entered. */}
          <StaffOnly>
            <Link href="/checkin" className="text-white/75 hover:text-white transition-colors">
              Scanner
            </Link>
            <Link href="/admin" className="text-white/75 hover:text-white transition-colors">
              Admin
            </Link>
          </StaffOnly>
          <Link
            href="/register"
            className="rounded-full bg-gold text-navy px-4 py-2 font-semibold hover:bg-gold-light transition-colors"
          >
            Register
          </Link>
        </nav>
      </div>
    </header>
  );
}
