# NewSpace Africa — Reg Portal

Registration now happens on our own form at **`/register`** (English and
French), which replaces Jotform. Registrants pay by card through **Stripe
Checkout**; once payment succeeds they get a unique QR check-in code
(`unique_code`) on screen and by email. Event staff use a camera-based
scanner (`/checkin`) and an admin dashboard (`/admin`).

The Jotform webhook still works during the switch-over; remove it once the
Jotform form is closed.

## Flow

1. Attendee fills in `/register` (same questions as the old Jotform form:
   name, email, job title, phone, nationality, country of residence,
   organisation + location, professional category, job function, invitation
   letter + optional passport upload, food allergies, safety/privacy consent,
   communication opt-ins, ticket, VAT number, invoice ID).
2. `POST /api/register` validates it, saves the attendee with
   `payment_status = 'pending'`, returns a signed upload link for the
   passport (stored in the private `passports` bucket) and a Stripe Checkout
   link. The browser uploads the passport, then goes to Stripe.
3. Stripe confirms payment → `POST /api/stripe-webhook` (and/or the
   `/register/success` page, whichever comes first) marks the attendee
   `paid` and emails the QR code. The success page also shows the QR code.
   **No QR code is ever sent for an unpaid registration**, and the scanner
   refuses to check in anyone whose payment is still pending.
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

## Registration form: things to know

- **Tickets and prices** live in `src/lib/tickets.ts` (Early Bird €500 until
  31 Dec 2026, Virtual €300). Early Bird disappears automatically after its
  deadline — add the next ticket (e.g. Standard) there before then.
- **Discount codes** are created in the Stripe dashboard (Products →
  Coupons → Promotion codes); registrants enter them on the Stripe page. A
  100% code registers them without a charge.
- **Invoices**: Stripe emails a paid invoice with the organisation, VAT
  number and invoice ID on it.
- **One registration per email.** Registering again with a paid email
  re-sends the QR code (at most every 10 minutes) and never shows it on
  screen. Registering again with an *unpaid* email lets them pay.
- **Retries are safe**: the browser sends the same random id if a
  submission is retried, so a dropped connection never creates duplicates.
- **Spam protection**: a hidden honeypot field, plus Cloudflare Turnstile
  when its keys are set.
- **Speakers, hosts and staff** don't register through the public form —
  add them with **+ Walk-in registration** in `/admin` (no payment needed).
  Choosing "Media" on the form gives a Press badge; everyone else is Delegate.
- **Passports** are private. In `/admin`, the **Passport** button opens a
  link that expires after 5 minutes.
- **Closing registration**: set `REGISTRATION_OPEN=false`.

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

   - `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` / `PUBLIC_BASE_URL` —
     for payments (see `.env.local.example`).
   - `NEXT_PUBLIC_TURNSTILE_SITE_KEY` / `TURNSTILE_SECRET_KEY` — optional
     spam protection.

2. Run `supabase/migrations/20260928120000_registration_form.sql` in the
   Supabase SQL editor **before deploying**. It adds the form's columns,
   payment tracking, the private `passports` bucket and a one-registration-
   per-email rule (the file explains how to find duplicates first if that
   last step fails).

3. In Stripe → Developers → Webhooks, add
   `https://your-domain.com/api/stripe-webhook` with the events
   `checkout.session.completed` and
   `checkout.session.async_payment_succeeded`, and copy its signing secret
   into `STRIPE_WEBHOOK_SECRET`. Test the whole flow with Stripe test keys
   and card `4242 4242 4242 4242` before switching to live keys.

4. `npm run dev` and open `/register` or `/checkin` to try the scanner (camera permission
   required — use `https://` or `localhost`, browsers block camera access on
   plain HTTP elsewhere).

5. Deploy (e.g. Vercel). While Jotform is still live, in Jotform: **Settings → Integrations →
   Webhooks**, add:
   `https://your-domain.com/api/jotform-webhook?secret=YOUR_JOTFORM_WEBHOOK_SECRET`

## Attendee schema

The `attendees` table in Supabase. The original columns were created in the
dashboard; later changes are in `supabase/migrations/`. Original columns:

| Column | Type | Notes |
| --- | --- | --- |
| `id` | uuid | primary key |
| `jotform_submission_id` | text, unique | null for walk-in registrations |
| `jotform_form_id` | text | |
| `full_name` | text | |
| `email` | text | |
| `phone` | text | |
| `organization` | text | |
| `role` | text | free text, e.g. `speaker`/`delegate`/`host`/`staff`/`sponsor` |
| `unique_code` | text, unique | the value encoded in the attendee's QR |
| `checked_in` | boolean | |
| `checked_in_at` | timestamptz | |
| `checked_in_station` | text | which station name checked them in |
| `badge_printed_at` | timestamptz | |
| `badge_print_count` | int | |
| `qr_email_sent_at` | timestamptz | |
| `raw_payload` | jsonb | full raw Jotform submission, for debugging |
| `created_at` / `updated_at` | timestamptz | |

Added by the registration-form migration: `first_name`, `last_name`,
`job_title`, `nationality`, `residence_country`, `organization_country`,
`professional_category`, `job_function`, `needs_invitation_letter`,
`passport_path`, `food_allergies`, `opt_in_organizer`, `opt_in_sponsors`,
`vat_number`, `invoice_reference`, `source` (`web` / `walk_in` / `jotform`),
`language` (`en` / `fr`), `consent_at`, `ticket_type`, `amount_cents`,
`currency`, `payment_status` (`pending` / `paid` / `not_required`; empty
for Jotform rows), `stripe_session_id`, `paid_at`.

RLS is enabled with no public policies — everything goes through the
service-role-backed API routes.

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
