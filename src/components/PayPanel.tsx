"use client";

import { useState } from "react";
import { Alert, Button, cx } from "@/components/ui";
import { PAY_COPY } from "@/lib/pay-copy";

// The interactive part of /pay/<link>: the ticket and price (or a choice of
// tickets), and the button that opens a fresh Stripe payment page.

type Offer =
  | { kind: "pay"; ticket: string; price: string; note: string | null }
  | { kind: "choose"; intro: string; tickets: { id: string; name: string; description: string; price: string }[] };

export default function PayPanel({ token, language, offer }: { token: string; language: "en" | "fr"; offer: Offer }) {
  const t = PAY_COPY[language];
  const [ticketId, setTicketId] = useState(offer.kind === "choose" && offer.tickets.length === 1 ? offer.tickets[0].id : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function pay() {
    if (offer.kind === "choose" && !ticketId) {
      setError(t.chooseFirst);
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/pay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, ...(offer.kind === "choose" ? { ticketId } : {}) }),
      });
      const json = (await res.json().catch(() => ({}))) as { status?: string; checkoutUrl?: string };
      if (json.status === "checkout" && json.checkoutUrl) {
        window.location.assign(json.checkoutUrl);
        return;
      }
      // Paid, closed or the tickets changed meanwhile: the page shows what's true now.
      if (json.status === "paid" || json.status === "closed" || json.status === "choose") {
        window.location.reload();
        return;
      }
      setError(t.failed);
    } catch {
      setError(t.failed);
    }
    setBusy(false);
  }

  return (
    <div className="space-y-5">
      {offer.kind === "pay" ? (
        <div className="divide-y divide-line rounded-lg border border-line bg-canvas text-sm">
          <dl className="divide-y divide-line">
            <div className="flex justify-between gap-4 px-4 py-3">
              <dt className="text-ink-3">{t.ticket}</dt>
              <dd className="text-right font-semibold text-ink">{offer.ticket}</dd>
            </div>
            <div className="flex items-center justify-between gap-4 px-4 py-3">
              <dt className="text-ink-3">{t.toPay}</dt>
              <dd className="font-display text-xl font-bold text-blue">{offer.price}</dd>
            </div>
          </dl>
          {offer.note && <p className="px-4 py-3 text-ink-2">{offer.note}</p>}
        </div>
      ) : (
        <fieldset className="space-y-3">
          <legend className="mb-3 text-ink-2">{offer.intro}</legend>
          {offer.tickets.map((x) => (
            <label
              key={x.id}
              className={cx(
                "flex cursor-pointer items-start gap-3 rounded-md border bg-surface p-4 transition-colors duration-150 hover:border-ink-3",
                ticketId === x.id ? "border-blue ring-1 ring-inset ring-blue" : "border-line-strong"
              )}
            >
              <input type="radio" name="ticket" value={x.id} checked={ticketId === x.id} onChange={() => setTicketId(x.id)} className="mt-1 h-5 w-5 shrink-0" />
              <span className="min-w-0 flex-1 space-y-1">
                <span className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <span className="font-semibold text-ink">{x.name}</span>
                  <span className="font-display text-lg font-bold text-blue">{x.price}</span>
                </span>
                {x.description && <span className="block text-sm text-ink-3">{x.description}</span>}
              </span>
            </label>
          ))}
        </fieldset>
      )}

      {error && <Alert tone="error">{error}</Alert>}
      <Button variant="primary" size="lg" className="w-full" loading={busy} onClick={pay}>
        {busy ? t.redirecting : t.pay}
      </Button>
      <p className="text-sm text-ink-3">{t.secure}</p>
    </div>
  );
}
