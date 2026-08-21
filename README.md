# NewSpace Africa — Reg Portal

Jotform stays the registration form. This app turns each submission into a
Supabase record with a unique QR check-in code (`unique_code`), emails that
QR code to the attendee, and gives event staff a camera-based scanner
(`/checkin`) plus an admin dashboard (`/admin`) to manage attendees.

## Flow

1. Attendee registers via the existing Jotform.
2. Jotform webhook → `POST /api/jotform-webhook` — maps the submission to an
   attendee record, generates a `unique_code` + QR code, saves to Supabase,
   emails the QR code.
3. Event day: staff open `/checkin`, enter the shared staff access code once,
   and scan attendee QR codes with the device camera.
4. A scan looks the attendee up (`/api/checkin/lookup`), shows their name +
   role, and offers **Confirm check-in** and **Print badge**.
5. **Print badge** opens the browser print dialog with a badge-sized page
   (defaults to 3.5in × 5.5in — adjust `--badge-width` / `--badge-height` in
   `src/app/globals.css` to match your badge stock/printer).
6. `/admin` gives staff a live attendee list with search/filters, registered
   vs. checked-in stats, and per-attendee actions:
   - **Resend QR** — re-sends the QR email (for anyone who didn't get it, or
     lost it).
   - **Mark checked in / Undo check-in** — manual override for edge cases
     (lost QR, verified by hand, or undoing an accidental scan).
   - **+ Walk-in registration** — registers someone who shows up without a
     prior Jotform submission: creates their record and emails their QR code
     immediately, same as the webhook path.
   - **Export CSV** — downloads the currently filtered attendee list.

## Setup

1. `cp .env.local.example .env.local` and fill in:
   - `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` — from your Supabase
     project's API settings. **Service role**, not anon — these routes run
     server-side only and bypass RLS on purpose.
   - `RESEND_API_KEY` / `EMAIL_FROM` — from [resend.com](https://resend.com).
     `EMAIL_FROM` must be on a domain you've verified with Resend.
   - `STAFF_ACCESS_CODE` — shared PIN the check-in desk enters once per
     device. Leave unset to disable the gate entirely (not recommended,
     since these routes expose attendee names/emails).
   - `JOTFORM_WEBHOOK_SECRET` — optional, appended as `?secret=...` to the
     webhook URL so random internet POSTs can't create fake attendees.

2. Run the schema in `supabase/schema.sql` against your Supabase project
   (SQL Editor, or `supabase db push` if you use the CLI).

3. `npm run dev` and open `/checkin` to try the scanner (camera permission
   required — use `https://` or `localhost`, browsers block camera access on
   plain HTTP elsewhere).

4. Deploy (e.g. Vercel), then in Jotform: **Settings → Integrations →
   Webhooks**, add:
   `https://your-domain.com/api/jotform-webhook?secret=YOUR_JOTFORM_WEBHOOK_SECRET`

## Jotform field mapping

`src/lib/jotform-mapping.ts` matches your Jotform fields by *keyword* in the
field name (e.g. anything containing "email", "name", "role"/"type") since
the exact field IDs weren't available when this was built. **Submit a real
test entry through your Jotform once it's wired up**, check the
`raw_payload` column on the resulting Supabase row (or your server logs) to
see the actual field keys Jotform sent, and tighten the matching in that file
if anything mapped incorrectly — especially the role keyword lists, since
those decide what prints on the badge (Speaker / Delegate / Host / Staff /
Sponsor).

## Notes / next steps

- **Staff auth** is a single shared PIN (`STAFF_ACCESS_CODE`), fine for one
  event with a small check-in team. If you need per-staff accounts or an
  audit trail of who checked in whom, swap `src/lib/staff-auth.ts` for
  Supabase Auth.
- **Duplicate check-ins** are handled — scanning an already-checked-in
  attendee shows a warning but still allows re-printing a badge.
- **`/admin` and `/checkin` share the same staff code** (same localStorage
  key) — entering it once on either page unlocks both. If you want the admin
  dashboard behind a separate, stronger secret, split `STAFF_ACCESS_CODE`
  into two env vars and two `x-staff-code`-style checks in
  `src/lib/staff-auth.ts`.
- **RLS**: the `attendees` table has Row Level Security enabled with no
  public policies — all access goes through server-side API routes using the
  service role key. Don't use the Supabase anon key for this table.
