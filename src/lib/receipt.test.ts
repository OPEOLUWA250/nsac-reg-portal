import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { buildReceiptContent, formatAmount, receiptFilename, receiptNumber } from "./receipt";
import { hasReceipt, type Attendee } from "./types";

const paid = {
  id: "8f3c2a10-1111-4000-8000-000000000000", full_name: "Ada Obi", email: "ada@example.com", job_title: "Engineer",
  organization: "Example Space Ltd", organization_country: "Nigeria", vat_number: "NG-123", invoice_reference: "PO-118",
  role: "delegate", ticket_type: "early-bird", amount_cents: 50000, currency: "eur", payment_status: "paid",
  paid_at: "2026-11-04T10:02:47Z", updated_at: "2026-11-04T10:02:47Z", registration_number: 4, promo_code: null, language: "en",
} as unknown as Attendee;

describe("who gets a receipt", () => {
  it("only registrations that paid something", () => {
    expect(hasReceipt(paid)).toBe(true);
    expect(hasReceipt({ payment_status: "paid", amount_cents: 0 })).toBe(false); // 100% promo code
    expect(hasReceipt({ payment_status: "pending", amount_cents: 50000 })).toBe(false);
    expect(hasReceipt({ payment_status: "not_required", amount_cents: null })).toBe(false); // walk-in
    expect(hasReceipt({ payment_status: null, amount_cents: null })).toBe(false); // Jotform
  });
});

describe("the receipt", () => {
  it("says who paid, for what, how much, with the Stripe payment ID", () => {
    const c = buildReceiptContent(paid, { ticketName: "Early Bird", paymentId: "pi_123" });
    expect(c.meta).toEqual([["Receipt No.", "NSAC27-RCT-0004"], ["Date", "4 November 2026"]]);
    expect(c.from).toEqual(["Ada Obi", "Engineer", "Example Space Ltd, Nigeria", "ada@example.com", "VAT number: NG-123", "Your reference: PO-118"]);
    expect(c.issuer[0]).toBe("Space in Africa");
    expect(c.item.description).toBe("NewSpace Africa Conference 2027: Early Bird ticket");
    expect(c.item.details).toContain("Registration category: Delegate");
    expect(c.total).toBe("€500.00");
    expect(c.payment).toContainEqual(["Payment ID", "pi_123"]);
    expect(c.payment).toContainEqual(["Registration No.", "4"]);
    expect(c.summary).toContainEqual(["Amount paid", "€500.00"]);
  });

  it("is in French for French registrants, with French punctuation and amounts", () => {
    const c = buildReceiptContent({ ...paid, language: "fr", role: "exhibitor", promo_code: "ASV-2027", amount_cents: 37500 } as Attendee, { ticketName: "Early Bird", paymentId: "pi_1" });
    expect(c.title).toBe("Reçu de paiement");
    expect(c.item.description).toBe("Conférence NewSpace Africa 2027 : billet « Early Bird »");
    expect(c.total).toBe("375,00 €");
    expect(c.item.details).toContain("Catégorie d’inscription : Exposant(e)");
    expect(c.item.details).toContain("Code promo : ASV-2027");
    expect(c.from).toContain("N° de TVA : NG-123");
  });

  it("leaves out what it doesn't know", () => {
    const c = buildReceiptContent({ ...paid, job_title: null, organization: null, organization_country: null, vat_number: null, invoice_reference: " ", registration_number: null } as Attendee, { ticketName: "Standard", paymentId: null });
    expect(c.from).toEqual(["Ada Obi", "ada@example.com"]);
    expect(c.payment.map(([label]) => label)).toEqual(["Payment method", "Paid on"]);
    expect(c.meta[0][1]).toBe("NSAC27-RCT-8F3C2A10");
  });

  it("formats other currencies and names the file after the receipt", () => {
    expect(formatAmount(12345, "usd", "en")).toBe("US$123.45");
    expect(receiptNumber({ id: "x", registration_number: 12 })).toBe("NSAC27-RCT-0012");
    expect(receiptFilename({ id: "x", registration_number: 12 })).toBe("newspace-africa-2027-receipt-NSAC27-RCT-0012.pdf");
  });

  it("draws a one-page PDF", async () => {
    const { renderReceiptPdf } = await import("@/lib/server/receipt-pdf");
    const pdf = await renderReceiptPdf(buildReceiptContent(paid, { ticketName: "Early Bird", paymentId: "pi_123" }));
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdf.toString("latin1").match(/\/Type\s*\/Page\b/g)).toHaveLength(1);
  }, 30_000);
});
