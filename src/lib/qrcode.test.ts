import { afterEach, expect, it, vi } from "vitest";
import { codeFromQr, ticketQrContent } from "./qrcode";

afterEach(() => vi.unstubAllEnvs());
it("puts the public contact URL in the QR and keeps it usable by check-in", () => {
  vi.stubEnv("PUBLIC_BASE_URL", "https://event.example.com/");
  const qr = ticketQrContent("abcdef12345678");
  expect(qr).toBe("https://event.example.com/p/abcdef12345678");
  expect(codeFromQr(qr)).toBe("abcdef12345678");
});
it("uses the production domain when the explicit URL is missing", () => {
  vi.stubEnv("PUBLIC_BASE_URL", "");
  vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "event.vercel.app");
  expect(ticketQrContent("abcdef12345678")).toBe("https://event.vercel.app/p/abcdef12345678");
});
it("does not silently issue QR codes that phones cannot open", () => {
  vi.stubEnv("PUBLIC_BASE_URL", "");
  vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "");
  expect(() => ticketQrContent("abcdef12345678")).toThrow("PUBLIC_BASE_URL");
});
