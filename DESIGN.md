# Design system

The NewSpace Africa Conference registration site: the public registration
form (the home page), the ticket page, the flyer maker, and staff tools
(admin, check-in scanner). It uses the conference website's own colours and
fonts ([newspace.spaceinafrica.com](https://newspace.spaceinafrica.com)), so
moving between the two feels like one site.

Every colour, font size, spacing value and corner radius comes from this file.
The tokens live in `src/app/globals.css` (`@theme`) and the shared components
in `src/components/ui.tsx`. When in doubt, use a component, not new classes.

## Principles

1. **On brand.** Brand blue `#03416A` and gold `#F09F07`, exactly as on the
   conference website, on a light grey page.
2. **Restrained.** Blue carries structure (bars, headings, selected states);
   gold marks the one main action and small accents. Nothing else is coloured
   except status.
3. **Flat.** No gradients, glows, drop shadows, blur or glass. Depth comes from
   a 1px border and a change of surface colour.
4. **Crisp.** Small corner radii. Controls look like controls.
5. **One main action per screen.** Exactly one gold button per page.
6. **Plain words.** Short sentences, no em dashes, no emoji, no arrows in
   labels.

## Colour

Tailwind's default palette is switched off (`--color-*: initial`), so only
these tokens exist. Use them by name (`bg-blue`, `text-ink-2`, `border-line`).
Don't put an opacity on text colours on light backgrounds (`text-blue/50`):
contrast becomes unpredictable.

| Token | Value | Use |
| --- | --- | --- |
| `blue` | `#03416A` | **Brand.** Header, sidebar, headings, secondary buttons, selected and focused states, links |
| `blue-hover` | `#0A5283` | Hover on blue buttons |
| `blue-deep` | `#02314F` | Pressed blue buttons, the planet on the flyer |
| `gold` | `#F09F07` | **Brand.** Primary button fill (with black text), progress, accents on blue. Never as text on light backgrounds |
| `gold-hover` / `gold-press` | `#DB8F00` / `#C27F00` | Primary button hover / pressed |
| `gold-ink` | `#8A5300` | Gold as small text on light backgrounds (eyebrows), which plain gold can't do legibly |
| `canvas` | `#F5F5F5` | Page background (the website's light grey; never pure white) |
| `surface` | `#FFFFFF` | Cards, inputs, menus, drawers, the admin top bar |
| `subtle` | `#EBEDEF` | Table header, skeletons, hover fill, highlighted list option |
| `line` | `#D8DCE0` | Borders and dividers |
| `line-strong` | `#858F99` | Input and outline-button borders (3:1 against white) |
| `ink` | `#232323` | Body text (the website's text colour) |
| `ink-2` | `#454B52` | Secondary text |
| `ink-3` | `#5E6670` | Hints, labels, captions (lowest allowed on light: 5.5:1) |
| `success` | `#1D6B43` | Paid, checked in, "working" |
| `danger` | `#B42318` | Errors, destructive actions, "not working" |

On blue, text is `white` (headings), `white/80` (body) or `white/65` (the
lowest allowed); gold is readable on blue (5:1) for accents. Borders on blue
are `white/15`.

Status is a coloured dot or border with ink text, never a pastel fill.

## Type

The conference website's two families, loaded with `next/font` in
`src/app/layout.tsx`. The ticket image, share image and flyer use them too.

- **Raleway** (`font-display`), weights 700 and 800: titles, big numbers,
  prices. The website sets its headings in Raleway 800.
- **DM Sans** (`font-sans`, the default), weights 400 to 700: everything else.

| Role | Classes |
| --- | --- |
| Page title (h1) | `font-display text-3xl font-extrabold text-blue` (`sm:text-4xl` on public pages) |
| Section title (h2) | `font-display text-xl font-bold text-blue` |
| Stat / price | `font-display text-2xl` or `text-3xl font-bold` |
| Body (public pages) | `text-base` |
| Body (staff pages), table text | `text-sm` |
| Label | `text-sm font-semibold text-ink` (turns `text-blue` while its field is focused) |
| Hint, caption | `text-sm text-ink-3` |
| Eyebrow | `text-xs font-semibold uppercase tracking-wider text-gold-ink` (`text-gold` on blue) |
| Meta, table header | `text-xs font-semibold uppercase tracking-wider text-ink-3` |

Only Tailwind's named sizes (`text-xs` to `text-5xl`), no pixel sizes. Inputs
are always at least `text-base` so phones don't zoom in.

## Spacing

A 4px grid, using Tailwind's scale only.

- Page gutter: `px-4 sm:px-6 lg:px-8`. Page top and bottom: `py-8 sm:py-12`.
- Between blocks on a page: `space-y-6`. Between fields: `space-y-5`.
- Card padding: `p-5 sm:p-6`. Compact tiles: `p-4`.
- Text width: `max-w-2xl` (the form), `max-w-prose` (legal pages).

## Radius

| Token | Value | Use |
| --- | --- | --- |
| `rounded-sm` | 4px | Chips, badges, skeleton lines |
| `rounded-md` | 6px | Buttons, inputs, choice tiles, menu items |
| `rounded-lg` | 8px | Cards, panels, menus, drawers, images |
| `rounded-full` | | Only avatars, status dots and the switch |

## Elevation

None: no `shadow-*`, no `backdrop-blur`. Menus and drawers sit on `surface`
with a `border-line` border; the page behind a drawer is dimmed with
`bg-blue/50`. The only box-shadow is the 1px inset ring that makes a focused
field's edge 2px.

## Components (`src/components/ui.tsx` and friends)

- **Button / ButtonLink / ButtonAnchor**: variants `primary` (gold with black
  text, 10:1, one per page), `secondary` (blue), `outline`, `ghost`, `danger`,
  `on-dark`. Sizes `sm` (36px, 44px on touch screens), `md` (44px), `lg`
  (48px). Each has hover, pressed (`active:`), focus and disabled styles;
  `loading` shows a spinner and disables it.
- **Card**: `surface`, `border-line`, `rounded-lg`.
- **Fields** (`inputClass()`): 48px tall, `line-strong` border, `text-base`.
  **Focused:** the border turns blue with an inset blue ring, so a 2px blue
  edge, and the label turns blue. No halo. **Invalid:** the same in `danger`.
- **CountryCombobox**: every country field. Type to narrow the list (accents
  optional: "senegal" finds "Sénégal"), or open the full list with the arrow.
  Arrows, Enter and Escape work; follows the ARIA combobox pattern.
- **Field**: label, control, hint, then the error right below with an icon,
  linked through `aria-describedby`.
- **Alert**: `error`, `success`, `info`. Surface background, 1px coloured
  border, icon, ink text.
- **Chip**: status label with a coloured dot (`RolePill`, `StatusPill`,
  `PaymentBadge`).
- **Skeleton**: `bg-subtle` blocks shaped like the content they stand in for.
- **EmptyState / ErrorState**: a title, one sentence and one action.
- **BrandLogo**: the white logo, pre-scaled to 2x and 3x of its 44px display
  height so it stays sharp. Nothing is written next to it.

## Layouts

- **Public pages**: blue header with the logo on the left; on phones a menu
  button opens the page links. Footer with Privacy, Terms and contact. No
  links to staff pages.
- **Admin**: full height. Blue sidebar with the logo top left, main pages at
  the top, Admins and Settings at the bottom (a slide-in menu on phones).
  White top bar with the notification bell and the profile menu (access level,
  Settings, scanner, Sign out) on the right. No public header or footer.
- **Scanner**: public header without menu, no footer.

## States

Every screen that loads data has four states, each a proper screen:
**loading** (skeleton), **empty** (what to do next), **error** (what happened
and a Try again button), **ready**. Every form shows errors inline next to the
field, a submitting state on its button, and a success or failure message.

## Motion

- Colour changes on hover and press: `transition-colors duration-150`. Hover
  never moves or scales anything.
- Drawers, menus, dropdowns and the country list fade or slide in over
  150-200ms (`starting:` styles). Form steps fade in.
- Everything respects `prefers-reduced-motion`.

## Accessibility

- Contrast: at least 4.5:1 for text, 3:1 for control borders.
- Focus: a 2px blue outline (`--focus`) on light surfaces, gold on blue
  (`.on-dark`). Never removed without a visible replacement.
- Tap targets at least 44×44px on touch screens.
- Everything works with the keyboard: menus and drawers close on Escape and
  return focus; the drawer keeps Tab inside while open; the flyer photo moves
  with the arrow keys.
- `rem` and `min-h-*` only, never fixed heights around text: at 200% text size
  nothing spills sideways (tested at 375px wide).
- Wide tables become stacked lists on phones; admin table columns follow the
  table's own width (container queries).

## Copy

- The form's first lines say what this is: event name, dates and place, then
  "Three short steps. You pay by card at the end, and your QR ticket arrives
  by email."
- Page titles: "Page | NewSpace Africa 2027" (template in the root layout);
  every page has a title and a description.
- No em dashes (use a full stop, comma or colon), no emoji, no arrow
  characters in buttons, no placeholder text.
- English and French side by side in `src/lib/*-copy.ts`. French uses a
  non-breaking space (` `) before `? ! : ;` and inside « ».

## Not used

Gradients, glows, radial "orbs", star or dot fields, glass or blur, drop
shadows, coloured left stripes, pastel fills, neon colours, emoji, sparkle
icons, animated arrows, icon libraries (icons are small inline SVGs with
`currentColor`).

**Exception: the flyer artwork** (`src/lib/flyer-draw.ts`, the image people
post on social media) keeps its own deep-space look: starfield, planet
horizon with glow, shadows and the gold card edge. It is a poster, not the
interface, and was kept by choice. It still uses the site fonts (Raleway and
DM Sans), passed in from the flyer maker page.
