import { NextRequest, NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import { adminRoute } from "@/lib/server/admin-auth";
import { isOwnerEmail, ownerEmails } from "@/lib/server/admin-emails";
import { ADMIN_ROLES, type AdminRole } from "@/lib/server/admin-roles";
import { passwordProblem } from "@/lib/admin-password";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { describeError } from "@/lib/describe-error";

export const runtime = "nodejs";

// /api/admin/admins: super admins manage who can sign in to the admin.
//   GET                                  owners (read-only) + admin_users
//   POST   { email, role, password }     add an admin with a temporary password
//   PATCH  { id, role }                  change someone's role
//   PATCH  { id, password }              give someone a new temporary password
//   DELETE ?id=<uuid>                    remove an admin (and their sign-in)
// Owners come from ADMIN_EMAILS and can't be changed here. Nobody can change
// their own role or remove themselves (so the last super admin can't lock
// everyone out by accident).

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// PostgREST "table doesn't exist" / "column doesn't exist" codes.
function missingTable(error: { code?: string } | null | undefined) {
  return Boolean(error && ["PGRST205", "42P01", "42703"].includes(error.code ?? ""));
}
const MISSING_TABLE = {
  error: "The admins table isn't set up yet. Run its setup script (20261001090000_admin_users.sql, see the README) in the Supabase SQL Editor.",
  missingTable: true,
};

function isRole(value: unknown): value is AdminRole {
  return typeof value === "string" && (ADMIN_ROLES as readonly string[]).includes(value);
}

interface AdminRow {
  id: string;
  email: string;
  role: AdminRole;
  created_at: string;
}

async function allAuthUsers(): Promise<User[]> {
  const users: User[] = [];
  for (let page = 1; ; page++) {
    const { data, error } = await supabaseAdmin().auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    users.push(...data.users);
    if (data.users.length < 200) break;
  }
  return users;
}

function accountInfo(user: User | undefined) {
  return {
    hasAccount: Boolean(user),
    lastSignInAt: user?.last_sign_in_at ?? null,
    mustChangePassword: user?.app_metadata?.must_change_password === true,
  };
}

export const GET = adminRoute(
  async (_req: NextRequest, _context: unknown, session) => {
    const { data, error } = await supabaseAdmin()
      .from("admin_users")
      .select("id, email, role, created_at")
      .order("created_at", { ascending: true });
    if (missingTable(error)) return NextResponse.json({ ...MISSING_TABLE, owners: ownerEmails().map((email) => ({ email, ...accountInfo(undefined) })), admins: [], me: session.email });
    if (error) {
      console.error(`List admins failed: ${describeError(error)}`);
      return NextResponse.json({ error: "Couldn't load the admins. Try again." }, { status: 500 });
    }

    let users: User[] = [];
    try {
      users = await allAuthUsers();
    } catch (err) {
      console.warn(`List auth users failed: ${describeError(err)}`);
    }
    const byEmail = new Map(users.map((u) => [u.email?.toLowerCase(), u]));
    const byId = new Map(users.map((u) => [u.id, u]));

    return NextResponse.json({
      me: session.email,
      owners: ownerEmails().map((email) => ({ email, ...accountInfo(byEmail.get(email)) })),
      admins: ((data ?? []) as AdminRow[])
        .filter((row) => !isOwnerEmail(row.email))
        .map((row) => ({ ...row, ...accountInfo(byId.get(row.id)) })),
    });
  },
  { superAdmin: true }
);

export const POST = adminRoute(
  async (req: NextRequest, _context: unknown, session) => {
    const body = (await req.json().catch(() => ({}))) ?? {};
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const role = body.role ?? "admin";
    const password = typeof body.password === "string" ? body.password : "";

    const fields: Record<string, string> = {};
    if (!EMAIL_RE.test(email) || email.length > 254) fields.email = "Enter a valid email address.";
    else if (isOwnerEmail(email)) fields.email = "This person is already an owner (set in ADMIN_EMAILS).";
    if (!isRole(role)) fields.role = "Choose Admin or Super admin.";
    const problem = passwordProblem(password);
    if (problem) fields.password = problem;
    if (Object.keys(fields).length) return NextResponse.json({ error: "Check the highlighted fields.", fields }, { status: 400 });

    const db = supabaseAdmin();
    const existing = await db.from("admin_users").select("id").eq("email", email).maybeSingle();
    if (missingTable(existing.error)) return NextResponse.json(MISSING_TABLE, { status: 500 });
    if (existing.error) return NextResponse.json({ error: "Couldn't check existing admins. Try again." }, { status: 500 });
    if (existing.data) {
      return NextResponse.json({ error: "Check the highlighted fields.", fields: { email: "This person is already an admin." } }, { status: 400 });
    }

    // Their sign-in account, confirmed straight away, with a temporary password
    // they must replace the first time they sign in.
    const created = await db.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      app_metadata: { must_change_password: true },
    });
    if (created.error || !created.data.user) {
      const exists = /already (been )?registered|already exists/i.test(created.error?.message ?? "");
      console.warn(`Create admin ${email} failed: ${created.error?.message}`);
      return NextResponse.json(
        exists
          ? { error: "Check the highlighted fields.", fields: { email: "This email already has a sign-in account. Remove it in Supabase (Authentication → Users) first, or use another email." } }
          : { error: "Couldn't create the account. Try again." },
        { status: exists ? 400 : 500 }
      );
    }

    const userId = created.data.user.id;
    const inserted = await db.from("admin_users").insert({ id: userId, email, role, created_by: session.user.id });
    if (inserted.error) {
      // Don't leave a sign-in account behind without an admin row.
      await db.auth.admin.deleteUser(userId).catch(() => undefined);
      console.error(`Add admin ${email} failed: ${describeError(inserted.error)}`);
      return NextResponse.json(missingTable(inserted.error) ? MISSING_TABLE : { error: "Couldn't add the admin. Try again." }, { status: 500 });
    }
    return NextResponse.json({ ok: true, id: userId });
  },
  { superAdmin: true }
);

export const PATCH = adminRoute(
  async (req: NextRequest, _context: unknown, session) => {
    const body = (await req.json().catch(() => ({}))) ?? {};
    const id = typeof body.id === "string" ? body.id : "";
    if (!UUID_RE.test(id)) return NextResponse.json({ error: "Missing admin id." }, { status: 400 });

    const db = supabaseAdmin();
    const { data: row, error } = await db.from("admin_users").select("id, email, role").eq("id", id).maybeSingle();
    if (missingTable(error)) return NextResponse.json(MISSING_TABLE, { status: 500 });
    if (error) return NextResponse.json({ error: "Couldn't update. Try again." }, { status: 500 });
    if (!row || isOwnerEmail(row.email)) return NextResponse.json({ error: "That admin doesn't exist." }, { status: 404 });

    if (body.role !== undefined) {
      if (id === session.user.id) return NextResponse.json({ error: "You can't change your own role." }, { status: 400 });
      if (!isRole(body.role)) return NextResponse.json({ error: "Choose Admin or Super admin." }, { status: 400 });
      const updated = await db.from("admin_users").update({ role: body.role }).eq("id", id);
      if (updated.error) return NextResponse.json({ error: "Couldn't change the role. Try again." }, { status: 500 });
      return NextResponse.json({ ok: true });
    }

    if (body.password !== undefined) {
      const password = typeof body.password === "string" ? body.password : "";
      const problem = passwordProblem(password);
      if (problem) return NextResponse.json({ error: problem, fields: { password: problem } }, { status: 400 });
      const updated = await db.auth.admin.updateUserById(id, { password, app_metadata: { must_change_password: true } });
      if (updated.error) {
        console.warn(`Temporary password for ${row.email} failed: ${updated.error.message}`);
        return NextResponse.json({ error: "Couldn't set the password. Try again." }, { status: 500 });
      }
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Nothing to change." }, { status: 400 });
  },
  { superAdmin: true }
);

export const DELETE = adminRoute(
  async (req: NextRequest, _context: unknown, session) => {
    const id = req.nextUrl.searchParams.get("id") ?? "";
    if (!UUID_RE.test(id)) return NextResponse.json({ error: "Missing admin id." }, { status: 400 });
    if (id === session.user.id) return NextResponse.json({ error: "You can't remove yourself." }, { status: 400 });

    const db = supabaseAdmin();
    const { data: row, error } = await db.from("admin_users").select("email").eq("id", id).maybeSingle();
    if (missingTable(error)) return NextResponse.json(MISSING_TABLE, { status: 500 });
    if (error) return NextResponse.json({ error: "Couldn't remove. Try again." }, { status: 500 });
    if (!row || isOwnerEmail(row.email)) return NextResponse.json({ error: "That admin doesn't exist." }, { status: 404 });

    // The row first: from that moment they're no longer an admin, even if
    // deleting the sign-in account below fails.
    const removed = await db.from("admin_users").delete().eq("id", id);
    if (removed.error) return NextResponse.json({ error: "Couldn't remove. Try again." }, { status: 500 });
    const deleted = await db.auth.admin.deleteUser(id);
    if (deleted.error) console.warn(`Admin ${row.email} removed, but deleting their sign-in failed: ${deleted.error.message}`);
    return NextResponse.json({ ok: true });
  },
  { superAdmin: true }
);
