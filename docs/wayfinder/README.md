# Venue wayfinder

The venue map at `/venue`: booths, rooms and registration desks for NSAC 2027
in Dakar, with walking directions. Built from the approved prototype
(`wayfinder-reference.html` in this folder) and the draft floor plan
(`Floorplan-2027.pdf`).

## Where things are

| What | File |
| --- | --- |
| Rooms, doors, booths, desks, AC units, tables, QR points | `src/lib/venue/data.ts` |
| Places list (adds exhibitor names to booths) | `src/lib/venue/places.ts` |
| Walking grid, A* route, smoothing | `src/lib/venue/pathfinding.ts` (grid built off the main thread by `grid.worker.ts`) |
| Turn-by-turn steps | `src/lib/venue/directions.ts` |
| `?from=` / `?to=` in the address | `src/lib/venue/params.ts` |
| Booth assignments (Supabase) and the admin editor | `src/lib/server/booth-assignments.ts`, `src/app/api/admin/booths/route.ts`, `src/components/admin/BoothsPanel.tsx` |
| The page | `src/app/venue/page.tsx`, `src/components/venue/*` |
| Printable QR stickers (staff) | `src/app/admin/venue-stickers/page.tsx`, at `/admin/venue-stickers` |

Tests: `npx vitest run src/lib/venue`.

## Links

- `/venue?from=Q3`: start at a QR point (what the stickers link to).
- `/venue?to=W-S4`: route from the main entrance to a booth.
- `/venue?from=Q1&to=E-L2`: both.

Codes ignore case and the hyphen (`ws4` works). Rooms and desks work by code
too (`NR`, `RG1`). Unknown codes fall back to the main entrance, with no
destination.

## Assign a booth to an exhibitor

In the admin: **Venue booths** (`/admin/booths`). Any admin can do it.

1. Click the booth on the plan, or find it in the list (search by booth,
   company or room; filter Assigned or Free).
2. Choose the status:
   - **Sold**: confirmed. The company's name shows on the public map.
   - **Reserved**: on hold for a company. The public map shows the booth
     hatched and labelled "Reserved", without the name (the name never leaves
     the server), so unconfirmed deals aren't announced.
3. Fill in the company (required), and optionally the sector, website and
   logo address. Save.
4. The public map shows it on its next page load: on the booth (when the name
   fits), in search, in the Exhibitors A–Z list and in the directions
   ("Arrive at Sahel Orbital (W-S4) on your left"). The admin page records who
   changed it and when.

Visitors find confirmed companies under **Exhibitors A–Z** on the venue map:
every sold booth, by company name, with a heading per letter.

"Free this booth" takes the company off the map. The QR sticker sheet is
linked from the same page.

Behind it is the `booth_assignments` table in Supabase (one row per assigned
booth, keyed by the code on the plan). It is created once with the setup SQL
from the build notes; until then the admin page says so, and the public map
shows every booth as "not yet assigned".

## Move a door

Each room in `ZONES` (`data.ts`) has `doors: [{ side, a, b }]`:

- `side`: the wall, `t` top, `b` bottom, `l` left or `r` right.
- `a`, `b`: where the gap starts and ends along that wall, in map units (x for
  top and bottom walls, y for left and right walls). 1 unit is about 0.3 m.

A doorway between two rooms needs a matching gap in both rooms' walls (for
example the Main Entrance top wall and the Registration Foyer bottom wall).
Run the tests afterwards: they check every booth is still reachable.

The door between the Main Entrance and the Registration Foyer, and the way in
from outside, are assumptions (central openings). Check them against the final
plan.

## Add toilets, catering, exits and other facilities

Add an entry to `FACILITIES` in `data.ts`:

```ts
{ id: "wc-west", code: "WC1", name: "Toilets (west)", category: "toilets", area: "West Room", anchor: [8, 60] },
```

`category` is one of `registration`, `toilets`, `catering`, `exit`, `prayer`,
`media`, `info` or `medical`; it picks the icon on the map. `anchor` is where
routes end. Without a `rect` the map shows the icon at the anchor; with one, it
draws the outline and nobody walks through it. Facilities appear in search,
under the Facilities filter and in the "You are at" list on their own.

## Known gaps in the draft plan

Kept as drawn, not silently fixed:

- The North Room label says 20 booths; the drawing has 22. The plan's legend
  totals don't add up. We use the 66 drawn: 24 × 4×3 m, 38 × 3×3 m, 4 × 6×6 m.
- The entrance booths are labelled Booth 1, Booth 1, Booth 2, Booth 3. We use
  M-1 to M-4.
- No toilets, catering, exits, prayer room or media area yet.
