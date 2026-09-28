import Link from "next/link";

export default function SiteHeader() {
  return (
    <header
      className="sticky top-0 z-20 border-b border-white/10"
      style={{
        background:
          "linear-gradient(120deg, var(--navy) 0%, var(--blue-2) 60%, var(--blue-1) 100%)",
      }}
    >
      <div className="max-w-6xl mx-auto px-5 sm:px-6 py-3.5 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2.5 group">
          <span className="h-2 w-2 rounded-full bg-gold shrink-0" />
          <span className="font-display text-white text-base sm:text-lg tracking-wide leading-none">
            NewSpace Africa
          </span>
          <span className="hidden sm:inline text-white/45 text-[11px] font-semibold uppercase tracking-[0.2em] leading-none ml-1">
            Registration Portal
          </span>
        </Link>
        <nav className="flex items-center gap-3.5 sm:gap-5 text-sm">
          <Link
            href="/register"
            className="text-gold-light hover:text-white font-semibold transition-colors"
          >
            Register
          </Link>
          <Link
            href="/checkin"
            className="text-white/75 hover:text-white transition-colors"
          >
            Scanner
          </Link>
          <Link
            href="/admin"
            className="text-white/75 hover:text-white transition-colors"
          >
            Admin
          </Link>
        </nav>
      </div>
    </header>
  );
}
