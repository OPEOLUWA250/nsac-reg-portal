import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { AdminSession } from "@/lib/server/admin-auth";
import { DELETE, GET, PUT } from "./route";

const mocks = vi.hoisted(() => ({ session: vi.fn(), list: vi.fn(), save: vi.fn(), clear: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/admin-auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/server/admin-auth")>();
  return { ...actual, adminRoute: actual.createAdminRoute(mocks.session) };
});
vi.mock("@/lib/server/booth-assignments", () => ({
  listBoothAssignments: mocks.list,
  saveBoothAssignment: mocks.save,
  clearBoothAssignment: mocks.clear,
  isMissingTable: (err: { code?: string }) => err?.code === "PGRST205",
}));

const admin = { user: { id: "a" }, email: "admin@example.com", role: "admin", mustChangePassword: false } as AdminSession;

const call = (handler: typeof PUT, method: string, body?: unknown) =>
  handler(new NextRequest("https://example.com/api/admin/booths", { method, body: body === undefined ? undefined : JSON.stringify(body) }), {});

beforeEach(() => {
  mocks.session.mockResolvedValue(admin);
  mocks.save.mockImplementation(async (input: object, by: string) => ({ ...input, updatedAt: "2026-10-26T12:00:00Z", updatedBy: by }));
});

it("needs an admin", async () => {
  mocks.session.mockResolvedValue(null);
  expect((await call(GET, "GET")).status).toBe(401);
  expect((await call(PUT, "PUT", { boothCode: "W-S4", companyName: "Acme" })).status).toBe(401);
  expect(mocks.save).not.toHaveBeenCalled();
});

it("lets any admin assign a booth, saved under their email", async () => {
  const res = await call(PUT, "PUT", { boothCode: "ws4", companyName: "Sahel Orbital", website: "sahelorbital.com" });
  expect(res.status).toBe(200);
  expect(mocks.save).toHaveBeenCalledWith(
    { boothCode: "W-S4", companyName: "Sahel Orbital", sector: null, website: "https://sahelorbital.com/", logoUrl: null },
    "admin@example.com"
  );
  expect(await res.json()).toMatchObject({ assignment: { boothCode: "W-S4", updatedBy: "admin@example.com" } });
});

it("explains what's wrong instead of saving", async () => {
  const res = await call(PUT, "PUT", { boothCode: "W-S99", companyName: "" });
  expect(res.status).toBe(400);
  expect(await res.json()).toMatchObject({ fields: { boothCode: expect.any(String), companyName: expect.any(String) } });
  expect(mocks.save).not.toHaveBeenCalled();
});

it("frees a booth", async () => {
  mocks.clear.mockResolvedValue(true);
  const res = await call(DELETE, "DELETE", { boothCode: "e-l2" });
  expect(res.status).toBe(200);
  expect(mocks.clear).toHaveBeenCalledWith("E-L2");
});

it("says when the table hasn't been set up", async () => {
  mocks.list.mockRejectedValue({ code: "PGRST205", message: "missing" });
  const res = await call(GET, "GET");
  expect(res.status).toBe(503);
  expect((await res.json()).error).toMatch(/setup SQL/);
});
