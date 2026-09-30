import { beforeEach, expect, it, vi } from "vitest";
import { getPublicContact } from "./public-contact";
import { GET } from "@/app/p/[code]/vcard/route";
import { NextRequest } from "next/server";

const mock = vi.hoisted(() => ({ single: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase-admin", () => ({ supabaseAdmin: () => ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: mock.single }) }) }) }) }));
const row = { full_name: "Ada Example", first_name: "Ada", last_name: "Example", email: "ada@example.com", phone: "+2348000000000", organization: "Space Team", job_title: "Engineer", nationality: "Nigeria", role: "delegate", payment_status: "paid", share_details: true, passport_path: "secret" };
beforeEach(() => mock.single.mockResolvedValue({ data: { ...row }, error: null }));
const context = { params: Promise.resolve({ code: "abcdef12345678" }) };
const request = new NextRequest("https://example.com/p/abcdef12345678/vcard");

it("returns only consented contact fields for a valid ticket", async () => {
  const result = await getPublicContact("abcdef12345678");
  expect(result.status).toBe("shared");
  if (result.status === "shared") {
    expect(result.contact).toMatchObject({ full_name: row.full_name, email: row.email, phone: row.phone, organization: row.organization, job_title: row.job_title, nationality: row.nationality });
    expect(result.contact).not.toHaveProperty("passport_path");
  }
  const response = await GET(request, context);
  expect(response.status).toBe(200);
  expect(await response.text()).toContain("EMAIL;TYPE=INTERNET:ada@example.com");
  expect(response.headers.get("cache-control")).toBe("private, no-store");
});

it.each([false, null, undefined, "true"])("exposes no details or download when consent is %s", async (share_details) => {
  mock.single.mockResolvedValue({ data: { ...row, share_details }, error: null });
  expect(await getPublicContact("abcdef12345678")).toEqual({ status: "private" });
  const response = await GET(request, context);
  expect(response.status).toBe(404);
  expect(await response.text()).not.toContain(row.email);
});

it("does not share an unpaid registration even with consent", async () => {
  mock.single.mockResolvedValue({ data: { ...row, payment_status: "pending" }, error: null });
  expect(await getPublicContact("abcdef12345678")).toEqual({ status: "invalid" });
  expect((await GET(request, context)).status).toBe(404);
});

it("rejects invalid codes without querying attendee data", async () => {
  expect(await getPublicContact("../private")).toEqual({ status: "invalid" });
  expect(mock.single).not.toHaveBeenCalled();
});

it("fails closed on database errors", async () => {
  mock.single.mockResolvedValue({ data: row, error: { message: "unavailable" } });
  expect(await getPublicContact("abcdef12345678")).toEqual({ status: "invalid" });
});
