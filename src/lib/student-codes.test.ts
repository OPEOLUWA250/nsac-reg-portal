import { beforeEach, expect, it, vi } from "vitest";

// A tiny stand-in for the Supabase query builder: every call chains, and the
// query resolves to `result`.
const db = vi.hoisted(() => {
  const state = { result: { data: null as unknown, error: null as unknown }, calls: [] as [string, unknown[]][] };
  const builder: Record<string, unknown> = {};
  for (const name of ["from", "select", "insert", "update", "eq", "is", "order", "limit", "single", "maybeSingle"]) {
    builder[name] = (...args: unknown[]) => {
      state.calls.push([name, args]);
      return builder;
    };
  }
  builder.then = (resolve: (v: unknown) => unknown) => resolve(state.result);
  return { state, builder };
});
vi.mock("@/lib/supabase-admin", () => ({ supabaseAdmin: () => db.builder }));
import { checkStudentCode, createStudentCode, markStudentCodeUsed } from "./student-codes";

const row = {
  id: "1", code: "STU-7K3QXP", email: "ada@uni.edu", name: "Ada", expires_at: "2026-12-31T23:59:59Z",
  created_at: "2026-10-01T00:00:00Z", created_by: "admin@example.com", cancelled_at: null, used_at: null,
  attendee_id: null, emailed_at: null, language: "en",
};
const now = new Date("2026-11-01T00:00:00Z");

beforeEach(() => {
  db.state.calls = [];
  db.state.result = { data: row, error: null };
});

it("accepts a code only with the email it was made for", async () => {
  expect(await checkStudentCode(" stu-7k3qxp ", "ADA@uni.edu", now)).toMatchObject({ ok: true });
  expect(db.state.calls).toContainEqual(["eq", ["code", "STU-7K3QXP"]]);
  // Someone else's code looks exactly like a wrong one.
  expect(await checkStudentCode("STU-7K3QXP", "friend@uni.edu", now)).toEqual({ ok: false, problem: "unknown" });
});

it("refuses unknown, cancelled, used and expired codes", async () => {
  db.state.result = { data: null, error: null };
  expect(await checkStudentCode("STU-AAAAAA", "ada@uni.edu", now)).toEqual({ ok: false, problem: "unknown" });
  db.state.result = { data: { ...row, cancelled_at: "2026-10-02T00:00:00Z" }, error: null };
  expect(await checkStudentCode("STU-7K3QXP", "ada@uni.edu", now)).toEqual({ ok: false, problem: "unknown" });
  db.state.result = { data: { ...row, used_at: "2026-10-03T00:00:00Z" }, error: null };
  expect(await checkStudentCode("STU-7K3QXP", "ada@uni.edu", now)).toEqual({ ok: false, problem: "used" });
  db.state.result = { data: row, error: null };
  expect(await checkStudentCode("STU-7K3QXP", "ada@uni.edu", new Date("2027-01-01T00:00:00Z"))).toEqual({ ok: false, problem: "expired" });
});

it("makes unique STU- codes for a lowercased email", async () => {
  await createStudentCode({ email: " Ada@Uni.edu ", name: " Ada ", expiresAt: row.expires_at, createdBy: "admin@example.com", language: "fr" });
  const insert = db.state.calls.find(([name]) => name === "insert")![1][0] as Record<string, string>;
  expect(insert).toMatchObject({ email: "ada@uni.edu", name: "Ada", language: "fr" });
  expect(insert.code).toMatch(/^STU-[A-HJ-NP-Z2-9]{6}$/);
});

it("marks a code used once, without ever throwing", async () => {
  await markStudentCodeUsed("STU-7K3QXP", "attendee-1");
  expect(db.state.calls).toContainEqual(["is", ["used_at", null]]);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  db.state.result = { data: null, error: { code: "500", message: "offline" } };
  await expect(markStudentCodeUsed("STU-7K3QXP", "attendee-1")).resolves.toBeUndefined();
});
