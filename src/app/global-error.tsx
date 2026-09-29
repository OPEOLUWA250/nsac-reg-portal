"use client";

// Last resort when the root layout itself fails. It can't use the app's
// stylesheet or fonts, so the few styles it needs are inline.
export default function GlobalError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, background: "#f5f5f2", color: "#0a1a31", fontFamily: "Arial, Helvetica, sans-serif" }}>
        <title>Something went wrong | NewSpace Africa 2027</title>
        <main style={{ maxWidth: 480, margin: "15vh auto", padding: "0 16px", textAlign: "center" }}>
          <h1 style={{ fontSize: 24 }}>This page didn&apos;t load</h1>
          <p style={{ color: "#3b4758", lineHeight: 1.5 }}>
            Something went wrong on our side. Try again in a moment, or write to info@spaceinafrica.com.
          </p>
          <button
            type="button"
            onClick={() => retry()}
            style={{ minHeight: 44, padding: "0 20px", border: 0, borderRadius: 6, background: "#f09f07", color: "#0a1a31", fontWeight: 600, fontSize: 14, cursor: "pointer" }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
