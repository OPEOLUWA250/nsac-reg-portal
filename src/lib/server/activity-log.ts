import "server-only";
import type { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { describeError } from "@/lib/describe-error";
import { clientIp } from "@/lib/server/rate-limit";
import type { ActivityArea } from "@/lib/activity";

// Records what admins do, in the admin_activity table (server only: no
// public policies). Call it after an action has succeeded. It never throws
// and never stops the action: a missing table or a database hiccup only
// shows in the server log. See src/lib/activity.ts.

const TABLE = "admin_activity";

export interface Actor {
  email: string;
  role?: string | null;
}

export interface ActivityInput {
  area: ActivityArea;
  action: string;
  /** Without the actor, starting with a verb: "deleted Ada Obi's registration". */
  summary: string;
  target?: { type: string; id?: string | null };
  details?: Record<string, unknown>;
}

let warned = false;

export async function logActivity(actor: Actor | null, entry: ActivityInput, req?: NextRequest): Promise<void> {
  try {
    const { error } = await supabaseAdmin()
      .from(TABLE)
      .insert({
        actor_email: actor?.email ?? null,
        actor_role: actor?.role ?? null,
        area: entry.area,
        action: entry.action,
        summary: entry.summary.slice(0, 500),
        target_type: entry.target?.type ?? null,
        target_id: entry.target?.id ?? null,
        details: entry.details ?? null,
        ip: req ? clientIp(req) : null,
      });
    if (error) throw error;
  } catch (err) {
    const code = (err as { code?: string } | null)?.code;
    // Before the setup SQL has run: say so once, not on every action.
    if (code === "PGRST205" || code === "42P01") {
      if (!warned) console.warn("Admin activity isn't being recorded: run the admin_activity setup SQL in Supabase.");
      warned = true;
      return;
    }
    console.error(`Couldn't record admin activity (${entry.action}): ${describeError(err)}`);
  }
}
