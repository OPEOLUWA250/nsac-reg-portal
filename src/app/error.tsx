"use client";

import { useEffect } from "react";
import { Button, ButtonLink, Card, linkClass } from "@/components/ui";
import { IconAlert } from "@/components/icons";
import { COPY } from "@/lib/registration-copy";

// Shown when a page fails to load (for example the database is down).
export default function ErrorPage({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main id="main" className="flex-1 px-4 py-12 sm:px-6">
      <Card role="alert" className="mx-auto max-w-lg space-y-4 p-6 text-center sm:p-8">
        <IconAlert className="mx-auto h-8 w-8 text-danger" />
        <h1 className="font-display text-2xl font-extrabold text-blue">This page didn&apos;t load</h1>
        <p className="text-ink-2">
          Something went wrong on our side. Try again in a moment. If it keeps happening, write to{" "}
          <a className={linkClass} href={`mailto:${COPY.en.helpEmail}`}>
            {COPY.en.helpEmail}
          </a>
          .
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          <Button variant="primary" onClick={() => retry()}>
            Try again
          </Button>
          <ButtonLink href="/" variant="outline">
            Go to the registration form
          </ButtonLink>
        </div>
        {error.digest && <p className="text-xs text-ink-3">Reference: {error.digest}</p>}
      </Card>
    </main>
  );
}
