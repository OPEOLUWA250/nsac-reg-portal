# NewSpace Africa — Reg Portal

Registration now happens on our own form, on the home page **`/`** (`/register` redirects there) (English and
French), which replaces Jotform. Registrants pay by card through **Stripe
Checkout**; once payment succeeds they get a unique QR check-in code
(`unique_code`) on screen and by email. Event staff use a camera-based
scanner (`/checkin`) and an admin dashboard (`/admin`).

The Jotform webhook still works during the switch-over; remove it once the
Jotform form is closed.

## Flow

1. Attendee fills in the form at `/` (same questions as the old Jotform form:
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
4. Event day: admins open `/checkin`, sign in with their admin account,
   and scan attendee QR codes with the device camera.
5. A scan looks the attendee up (`/api/checkin/lookup`), shows their name +
   role, and offers **Confirm check-in** and **Print badge**.
6. **Print badge** opens the browser print dialog with a badge-sized page
   (defaults to 3.5in × 5.5in — adjust `--badge-width` / `--badge-height` in
   `src/app/globals.css` to match your badge stock/printer).
7. `/admin` is the event control area, with a sidebar: **Dashboard**,
   **Tickets & prices** (`/admin/tickets`: add/edit prices, sale end dates
   that remove a ticket from the form automatically, end sale now,
   hide/show, delete unused tickets), **Settings** (`/admin/settings`:
   open/close registration, status of payments, email and security) and
   **Admins** (`/admin/admins`, super admins only: add admins with a
   temporary password, change roles, remove them). Everyone signs in at
   `/admin/login` with email and password (see **Admin sign-in** below).
   The dashboard (refreshes every 20 seconds):
   - **Overview** — registrations (and new in the last 24 h), paid, revenue,
     awaiting payment, checked in, invitation letters needed (and how many
     have no passport yet); breakdowns by ticket, nationality and
     professional category. Click "Awaiting payment" or "Invitation letters"
     to filter the list to those people.
   - **List** — search (name, email, organisation, phone, reference),
     filters (payment, ticket, role, check-in, needs invitation letter),
     sorting, 25 per page, quick **Check in / Undo** per row.
   - **Details** — click anyone to see everything they submitted (contact,
     professional, travel, ticket & payment with a link to the payment in
     Stripe, check-in & badge, consent, record) with **Resend QR email**,
     **Mark checked in / Undo**, **View passport** and **Copy email**.
   - **+ Walk-in** — registers someone at the desk (speakers, staff, guests)
     and emails their QR code immediately; no payment.
   - **Tickets & prices** — see "Registration form: things to know".
   - **Export CSV** — the current view, everyone, or just invitation-letter
     requests; every field in its own column, readable labels, opens in
     Excel / Google Sheets with accents and phone numbers intact.

## Registration form: things to know

- **Tickets and prices** are managed in `/admin` → **Tickets & prices**:
  change a price, name, description or sale end date, hide/show a ticket, or
  add a new one (e.g. Standard, before Early Bird ends). Changes apply to the
  form and to Stripe from the next page load; people who already registered
  keep the price they were charged. The starting tickets are Early Bird €500
  (until 31 Dec 2026) and Virtual €300.
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
- **Closing registration**: `/admin/settings` → Public registration switch
  (no redeploy). `REGISTRATION_OPEN=false` in the environment always
  forces it closed.
- **Tickets (PNG)**: after paying, registrants see and can download a
  branded ticket (logo, name, role, organisation, ticket type, QR code),
  and it's attached to the confirmation email. It's drawn by
  `src/lib/ticket-image.tsx` using the white logo in `public/brand/logo.png`
  and the conference site's colours (gold `#F09F07`, blue `#03416A`).
- **"I'm attending" flyers (`/flyer`)**: registrants add their photo and
  get a branded graphic in one size, 4:5 portrait (1080×1350 — LinkedIn's
  best size, also fine on Instagram and WhatsApp), with a "scan to
  register" QR code, the website, and a ready-made post text. It's linked from the
  success page (details pre-filled) and the confirmation email; anyone can
  also open it directly. The image is drawn in the browser — photos are
  never uploaded. Event date/place on it come from `src/lib/event-info.ts`
  (update it once the exact 2027 dates are announced).
- **Sending email.** Two options, picked by environment variables:
  - *SMTP* (e.g. the Google Workspace account): set `SMTP_HOST`,
    `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` (a Google App Password) and
    `EMAIL_FROM` to that account. Works without DNS changes; Google
    Workspace allows about 2,000 emails a day.
  - *Resend* (when `SMTP_HOST` is unset): needs the sending domain
    verified. With Resend's test sender (`onboarding@resend.dev`) emails
    only reach the Resend account owner. `newspace.spaceinafrica.com` has
    been added in Resend; its 3 DNS records (1 TXT, 2 CNAME) still need
    adding at the DNS host before it verifies. If a confirmation email fails, it is retried when the
  registrant revisits the success page or Stripe re-sends the webhook, and
  staff can always use **Resend QR** in `/admin`.

## Setup

1. `cp .env.local.example .env.local` and fill in:
   - `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` — from your Supabase
     project's API settings. **Service role**, not anon — these routes run
     server-side only and bypass RLS on purpose.
   - `RESEND_API_KEY` / `EMAIL_FROM` — from [resend.com](https://resend.com).
     `EMAIL_FROM` must be on a domain you've verified with Resend.
   - `JOTFORM_WEBHOOK_SECRET` — optional, appended as `?secret=...` to the
     webhook URL so random internet POSTs can't create fake attendees.

   - `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` / `PUBLIC_BASE_URL` —
     for payments (see `.env.local.example`).
   - `NEXT_PUBLIC_TURNSTILE_SITE_KEY` / `TURNSTILE_SECRET_KEY` — optional
     spam protection.
   - `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` — admin
     sign-in (public values, Supabase → Project Settings → API).
   - `ADMIN_EMAILS` — the owners: always super admins, comma-separated.
   - `CRON_SECRET` — any long random string; protects the daily
     keep-alive job (see **Keeping the free database awake**).

2. Run these in the Supabase SQL editor, in order, **before deploying**:
   - `supabase/migrations/20260928120000_registration_form.sql` — the form's
     columns, payment tracking, the private `passports` bucket and a
     one-registration-per-email rule (the file explains how to find
     duplicates first if that last step fails).
   - `supabase/migrations/20260928130000_tickets.sql` — the `tickets` table
     behind **Tickets & prices**, pre-filled with Early Bird and Virtual.
   - `supabase/migrations/20260928140000_attendee_roles.sql` — replaces the
     table's original role check (which rejected `delegate`, so every form
     submission failed) with the roles the app uses.
   - `supabase/migrations/20260929120000_more_tickets.sql` — Standard and
     Late tickets, hidden, placeholder prices.
   - `supabase/migrations/20260929130000_settings.sql` — the `settings`
     table behind the open/close registration switch.
   - `supabase/migrations/20260930120000_categories_and_sharing.sql`:
     registration categories (delegate, speaker, media, exhibitor, VIP),
     the "Can your details be shared?" answer, and the promo code used.
   - `supabase/migrations/20261001090000_admin_users.sql` — the
     `admin_users` table behind **Admins** (owners in `ADMIN_EMAILS` can
     sign in without it).

3. In Stripe → Developers → Webhooks, add
   `https://your-domain.com/api/stripe-webhook` with the events
   `checkout.session.completed` and
   `checkout.session.async_payment_succeeded`, and copy its signing secret
   into `STRIPE_WEBHOOK_SECRET`. Test the whole flow with Stripe test keys
   and card `4242 4242 4242 4242` before switching to live keys.

4. `npm run dev` and open `/` or `/checkin` to try the scanner (camera permission
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

- **Duplicate check-ins** are handled — scanning an already-checked-in
  attendee shows a warning but still allows re-printing a badge.
- **Admin sign-in** (Supabase Auth, email + password). `src/proxy.ts`
  sends anyone who isn't an admin from `/admin/*` to `/admin/login`, and
  every `/api/admin/*` route is wrapped in `adminRoute()`
  (`src/lib/server/admin-auth.ts`). Owners are the `ADMIN_EMAILS`; other
  admins are rows in `admin_users`. A new admin gets a temporary password
  and must set their own on first sign-in. Forgot password sends a link
  to `/api/auth/callback`: add `https://your-domain.com/api/auth/callback`
  under Supabase → Authentication → URL Configuration → Redirect URLs.
  To create the first owner's account: Supabase → Authentication → Users
  → Add user (tick auto-confirm), with the email in `ADMIN_EMAILS`.
  Open password-reset links in the same browser that requested them (PKCE).
  Run `npm test` for authentication regression tests, `npx tsc --noEmit`
  for type checking, and `npm run build` before deploying.
  With a configured Supabase project, verify an owner can sign in and add
  an admin, the temporary password forces a password change, regular admins
  cannot manage admins, and removing an admin revokes dashboard/API access.
  Test a reset email using the callback URL for the actual deployment.
- **The check-in scanner** requires a signed-in admin or super admin.
  `/checkin` redirects to admin login, then returns to the scanner. All
  `/api/checkin/*` routes and the legacy `/api/staff/verify` endpoint enforce
  `adminRoute()`, including the temporary-password restriction. A shared
  staff code no longer grants access; create admin accounts for the check-in team.
- **Keeping the free database awake**: Supabase's free plan pauses a
  project after 7 days without activity. `vercel.json` has Vercel call
  `/api/cron/keep-alive` every day at 06:00 UTC, which runs one small
  query. Check it in Vercel → Project → Settings → Cron Jobs (you can
  also run it by hand there).
- **RLS**: the `attendees` table has Row Level Security enabled with no
  public policies — all access goes through server-side API routes using the
  service role key. Don't use the Supabase anon key for this table.
