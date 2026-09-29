import type { Metadata } from "next";
import { ButtonLink, Card } from "@/components/ui";

export const metadata: Metadata = {
  title: "Page not found",
  description: "This page doesn't exist on the NewSpace Africa Conference 2027 registration site.",
};

export default function NotFound() {
  return (
    <main id="main" className="flex-1 px-4 py-12 sm:px-6">
      <Card className="mx-auto max-w-lg space-y-4 p-6 text-center sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-wider text-gold-ink">Error 404</p>
        <h1 className="font-display text-2xl font-extrabold text-blue">We couldn&apos;t find this page</h1>
        <p className="text-ink-2">The link may be old or mistyped.</p>
        <div className="flex flex-wrap justify-center gap-2">
          <ButtonLink href="/" variant="primary">
            Go to the registration form
          </ButtonLink>
        </div>
      </Card>
    </main>
  );
}
