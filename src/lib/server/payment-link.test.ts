import { beforeEach, expect, it, vi } from "vitest";
import type { Ticket } from "@/lib/tickets";
import type { Attendee } from "@/lib/types";

const mocks = vi.hoisted(() => ({ open: vi.fn(), tickets: vi.fn(), promo: vi.fn(), student: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/registration-config", () => ({ isRegistrationOpen: mocks.open }));
vi.mock("@/lib/ticket-store", () => ({ availableTickets: mocks.tickets }));
vi.mock("@/lib/promo-codes", () => ({ checkPromoCode: mocks.promo }));
vi.mock("@/lib/student-codes", () => ({ checkStudentCode: mocks.student }));

process.env.PAYMENT_LINK_SECRET = "test-secret";
const { attendeeIdFromToken, paymentLinkToken, paymentOffer } = await import("./payment-link");

const ID = "12345678-1234-4234-8234-123456789abc";
const ticket = (id: string, amountCents: number): Ticket => ({
  id,
  name: { en: id, fr: id },
  description: { en: "", fr: "" },
  amountCents,
  currency: "eur",
  availableUntil: null,
  active: true,
  sortOrder: 0,
});
const attendee = (over: Partial<Attendee> = {}) =>
  ({ id: ID, email: "ada@example.com", payment_status: "pending", ticket_type: "early_bird", promo_code: null, ...over }) as Attendee;

beforeEach(() => {
  mocks.open.mockResolvedValue(true);
  mocks.tickets.mockResolvedValue([ticket("early_bird", 50000), ticket("standard", 70000), ticket("student", 10000)]);
  mocks.promo.mockReset();
  mocks.student.mockReset();
});

it("only accepts links we signed", () => {
  const token = paymentLinkToken(ID);
  expect(attendeeIdFromToken(token)).toBe(ID);
  expect(attendeeIdFromToken(`${ID}.${"x".repeat(32)}`)).toBeNull();
  expect(attendeeIdFromToken(token.replace(ID, "12345678-1234-4234-8234-123456789abd"))).toBeNull();
  expect(attendeeIdFromToken("nonsense")).toBeNull();
});

it("charges today's price for their ticket", async () => {
  const offer = await paymentOffer(attendee());
  expect(offer).toMatchObject({ kind: "pay", amountCents: 50000, promo: null, codeDropped: null });
});

it("keeps their code while it works, and drops it once it doesn't", async () => {
  mocks.promo.mockResolvedValueOnce({ ok: true, promo: { code: "AFSA", percentOff: 20 } });
  expect(await paymentOffer(attendee({ promo_code: "AFSA" }))).toMatchObject({ kind: "pay", amountCents: 40000 });
  mocks.promo.mockResolvedValueOnce({ ok: false, problem: "used_up" });
  expect(await paymentOffer(attendee({ promo_code: "AFSA" }))).toMatchObject({ kind: "pay", amountCents: 50000, codeDropped: "AFSA" });
});

it("offers the tickets on sale now once theirs has ended, never the Student one", async () => {
  mocks.tickets.mockResolvedValue([ticket("standard", 70000), ticket("student", 10000)]);
  const offer = await paymentOffer(attendee());
  expect(offer.kind).toBe("choose");
  expect(offer.kind === "choose" && offer.tickets.map((t) => t.id)).toEqual(["standard"]);
  expect(await paymentOffer(attendee(), { ticketId: "standard" })).toMatchObject({ kind: "pay", amountCents: 70000 });
  expect((await paymentOffer(attendee(), { ticketId: "student" })).kind).toBe("choose");
});

it("needs a working student code for the Student ticket", async () => {
  mocks.student.mockResolvedValueOnce({ ok: true });
  expect(await paymentOffer(attendee({ ticket_type: "student", promo_code: "STU-1" }))).toMatchObject({ kind: "pay", studentCode: "STU-1", amountCents: 10000 });
  mocks.student.mockResolvedValueOnce({ ok: false, problem: "expired" });
  expect((await paymentOffer(attendee({ ticket_type: "student", promo_code: "STU-1" }))).kind).toBe("choose");
});

it("stops once they've paid or registration has closed", async () => {
  expect((await paymentOffer(attendee({ payment_status: "paid" }))).kind).toBe("paid");
  mocks.open.mockResolvedValue(false);
  expect((await paymentOffer(attendee())).kind).toBe("closed");
});
