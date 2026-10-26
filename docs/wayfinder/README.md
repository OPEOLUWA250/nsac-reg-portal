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
| Booth assignments from Supabase | `src/lib/server/booth-assignments.ts` |
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

Booths are edited in Supabase, with no code change and no redeploy. The map
picks a change up on the next page load.

1. Supabase, Table Editor, `booth_assignments`, Insert row.
2. `booth_code`: the code on the plan, exactly as printed, e.g. `W-S4` or `M-1`.
3. `company_name`: shown on the booth (when it fits), in search and in the
   directions ("Arrive at Sahel Orbital (W-S4) on your left").
4. `sector` (optional): shown under the name in search.
5. `website` (optional, `https://…`): a link on the route card.
6. `logo_url` (optional): stored for later; the map doesn't show logos yet.

To unassign a booth, delete its row. Rows with a code that isn't on the plan
are ignored.

The table is created once with the SQL from the build notes. Without it, every
booth shows as "not yet assigned" and the server log says so.

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
