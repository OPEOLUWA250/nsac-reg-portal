import BrandLogo from "@/components/BrandLogo";

// Frame for the sign-in pages (/admin/login, /admin/reset-password): no
// admin sidebar or top bar, since nobody is signed in yet.
export default function AdminAuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-1 flex-col bg-canvas">
      <div className="on-dark flex h-16 shrink-0 items-center bg-blue px-4 sm:px-6">
        <BrandLogo />
      </div>
      <main id="main" className="flex flex-1 items-start justify-center px-4 py-10 sm:items-center sm:py-16">
        <div className="w-full max-w-md">{children}</div>
      </main>
    </div>
  );
}
