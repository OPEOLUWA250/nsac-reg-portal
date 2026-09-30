import { expect, it } from "vitest";
import { safeAdminNext } from "./safe-next";

it.each(["/admin", "/admin/", "/admin/reset-password", "/admin/tickets"])("accepts admin destination %s", (path) => {
  expect(safeAdminNext(path)).toBe(path);
});

it.each([null, undefined, "", "https://evil.example", "//evil.example", "/administrator", "/admin/../api", "/admin/%2e%2e", "/admin\\evil", "/admin?next=evil", "/admin#fragment", "/admin\n"])("rejects unsafe destination %s", (path) => {
  expect(safeAdminNext(path, "/admin/reset-password")).toBe("/admin/reset-password");
});
