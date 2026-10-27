import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { AdminSession } from "@/lib/server/admin-auth";
import { POST } from "./route";

const mocks = vi.hoisted(() => ({ session: vi.fn(), read: vi.fn(), update: vi.fn(), send: vi.fn(), log: vi.fn(), updates: [] as unknown[] }));
vi.mock("@/lib/server/activity-log", () => ({ logActivity: mocks.log }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/admin-auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/server/admin-auth")>();
  return { ...actual, adminRoute: actual.createAdminRoute(mocks.session) };
});
vi.mock("@/lib/server/invitation-letter-pdf", () => ({
  renderLetterPdf: async () => Buffer.from("%PDF-1.4"),
  renderLetterPages: async () => [Buffer.from([0xff, 0xd8])],
}));
vi.mock("@/lib/ticket-image", () => ({ brandLogoPng: async () => null }));
vi.mock("@/lib/email", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/email")>()),
  sendInvitationLetterEmail: mocks.send,
}));
vi.mock("@/lib/supabase-admin", () => ({
  supabaseAdmin: () => ({
    from: () => ({
      select: () => {
        const chain = { eq: () => chain, maybeSingle: mocks.read };
        return chain;
      },
      update: (values: unknown) => {
        mocks.updates.push(values);
        const chain = { eq: () => chain, select: () => chain, maybeSingle: mocks.update };
        return chain;
      },
    }),
  }),
}));

const session = { user: { id: "admin-id" }, email: "admin@example.com", role: "admin", mustChangePassword: false } as AdminSession;
const id = "12345678-1234-4234-8234-123456789abc";
const attendee = {
  id,
  full_name: "Ada Obi",
  email: "ada@example.com",
  role: "delegate",
  payment_status: "paid",
  needs_invitation_letter: true,
  nationality: "Nigeria",
  residence_country: null,
  organization: null,
  job_title: null,
  registration_number: 12,
};
const fields = { senderEmail: "events@example.com", signatoryName: "Temi Oni", language: "en" };

const post = (body: unknown) =>
  POST(new NextRequest("https://example.com/api/admin/invitation-letter", { method: "POST", body: JSON.stringify(body) }), {});

beforeEach(() => {
  mocks.session.mockResolvedValue(session);
  mocks.read.mockResolvedValue({ data: attendee, error: null });
  mocks.update.mockResolvedValue({ data: { ...attendee, invitation_letter_sent_at: "2026-10-27T10:00:00Z" }, error: null });
  mocks.send.mockReset().mockResolvedValue(undefined);
  mocks.updates.length = 0;
  process.env.EMAIL_FROM = "NSAC <noreply@example.com>";
});

describe("invitation letters", () => {
  it("previews without sending or recording anything", async () => {
    const res = await post({ id, action: "preview", ...fields });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({ to: "ada@example.com", subject: expect.stringContaining("invitation letter"), filename: "invitation-letter-12-ada-obi.pdf" });
    expect(json.html).toContain("Temi Oni");
    expect(json.pages).toEqual([expect.stringMatching(/^data:image\/jpeg;base64,/)]);
    expect(mocks.send).not.toHaveBeenCalled();
    expect(mocks.updates).toEqual([]);
    expect(mocks.log).not.toHaveBeenCalled();
  });

  it("sends only when asked, with replies to the sender, and records who sent it", async () => {
    const res = await post({ id, action: "send", ...fields });
    expect(await res.json()).toMatchObject({ sent: true, recorded: true });
    expect(mocks.send).toHaveBeenCalledWith(
      expect.objectContaining({ toEmail: "ada@example.com", replyTo: "events@example.com", bcc: "events@example.com", filename: "invitation-letter-12-ada-obi.pdf" })
    );
    expect(mocks.updates).toEqual([{ invitation_letter_sent_at: expect.any(String), invitation_letter_sent_by: "admin@example.com" }]);
    expect(mocks.log).toHaveBeenCalledWith(session, expect.objectContaining({ action: "letter.sent", target: { type: "attendee", id } }), expect.anything());
  });

  it("leaves out the copy when the sender doesn't want one", async () => {
    await post({ id, action: "send", ...fields, copyToSender: false });
    expect(mocks.send).toHaveBeenCalledWith(expect.objectContaining({ bcc: null }));
  });

  it("records nothing when the email fails", async () => {
    mocks.send.mockRejectedValue(new Error("SMTP down"));
    const res = await post({ id, action: "send", ...fields });
    expect(res.status).toBe(502);
    expect(mocks.updates).toEqual([]);
  });

  it("says so when it can't be marked as sent before the SQL is run", async () => {
    mocks.update.mockResolvedValue({ data: null, error: { code: "PGRST204", message: "column not found" } });
    expect(await (await post({ id, action: "send", ...fields })).json()).toMatchObject({ sent: true, recorded: false, warning: expect.stringContaining("SQL") });
  });

  it("waits for payment, and checks the fields", async () => {
    mocks.read.mockResolvedValue({ data: { ...attendee, payment_status: "pending" }, error: null });
    expect((await post({ id, action: "send", ...fields })).status).toBe(409);
    expect(mocks.send).not.toHaveBeenCalled();
    const bad = await post({ id, action: "send", senderEmail: "nope" });
    expect(bad.status).toBe(400);
    expect((await bad.json()).fields).toMatchObject({ senderEmail: expect.any(String), signatoryName: expect.any(String) });
  });

  it("is for signed-in admins only", async () => {
    mocks.session.mockResolvedValue(null);
    expect((await post({ id, action: "send", ...fields })).status).toBe(401);
    expect(mocks.send).not.toHaveBeenCalled();
  });
});
