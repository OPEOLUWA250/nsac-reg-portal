import { expect, it, vi } from "vitest";
import type Stripe from "stripe";

vi.mock("@/lib/supabase-admin", () => ({ supabaseAdmin: vi.fn() }));
vi.mock("@/lib/attendee-service", () => ({ sendAttendeeQr: vi.fn() }));
import { checkoutAttendeeId, fulfillCheckoutSession } from "./payments";

const session = (fields: Partial<Stripe.Checkout.Session>) => fields as Stripe.Checkout.Session;

it("recognises only Checkout Sessions this portal created", () => {
  expect(checkoutAttendeeId(session({ client_reference_id: "a1", metadata: { attendee_id: "a1" } }))).toBe("a1");
  // The shared Stripe account's other checkouts (the Space in Africa website).
  expect(checkoutAttendeeId(session({ client_reference_id: "wp-order-123", metadata: {} }))).toBeNull();
  expect(checkoutAttendeeId(session({ client_reference_id: null, metadata: { attendee_id: "a1" } }))).toBeNull();
  expect(checkoutAttendeeId(session({ client_reference_id: "a2", metadata: { attendee_id: "a1" } }))).toBeNull();
  expect(checkoutAttendeeId(null)).toBeNull();
});

it("leaves other sites' paid sessions alone", async () => {
  const { supabaseAdmin } = await import("@/lib/supabase-admin");
  const paid = session({ client_reference_id: "wp-order-123", metadata: {}, payment_status: "paid" });
  expect(await fulfillCheckoutSession(paid)).toBeNull();
  expect(supabaseAdmin).not.toHaveBeenCalled();
});
