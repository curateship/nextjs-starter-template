# Themes and sounds in the admin

The themes and sounds members pick from live in the database, and an admin adds,
edits, orders, prices, hides and deletes them on two admin pages, Themes and
Sounds. A change reaches members on their next page load, with no deploy. Tyler
asked for this on 8 Oct 2026: "Media should be in 2 dashboard, one for themes
and one for sounds. Add ability to add sound and theme in admin dashboard
(click title and settings cog to open modal to add/edit)."

## Tyler's rules

- **Every sound runs 2 to 5 minutes.** Tyler, 8 Oct 2026: "It should change
  when the sound ends and because of that, we have to make each sound 2-5 mins
  each." The browser refuses a file outside that before sending it ("This sound
  is 0:48. Sounds need to run 2 to 5 minutes."), and the worker measures it
  again with FFprobe and refuses it there too. The eight sounds that shipped
  with the app run 44 to 53 seconds and were copied in as they were. They need
  longer versions before shuffle (`03-shuffle-tags-and-defaults.md`) ships.
- **A Draft or deleted item falls back at once.** Tyler, 8 Oct 2026. Anybody
  who had it in their personal room or a room gets the default scene (Lofi
  girl) or silence on their next load. Their saved choice is left as it was,
  so it comes back if the item is made Live again.

## Where the list lives

- **`pomodoro_catalog_items`**, migration `0123_pomodoro_catalog_items.sql`.
  One row per theme or sound: name, hint, kind, Free or Pro, Draft or Live,
  position, the file and the picture, credits, starting volume, and where the
  worker has got to with a new file.
- **The sixteen built-in items** were copied in with the keys they always had,
  so every saved `scene:<key>` and `curated:<key>` kept working. Their files
  stay under `public/`, where they ship.
- **A key never changes.** It is made from the name when an item is created
  ("Rain on a tin roof" becomes `rain-on-a-tin-roof`, then `-2` if taken),
  because every saved choice points at it.

## How a page gets it

- **The server reads the Live items** (`loadMediaCatalog` in
  `src/server/pomodoro/catalog.ts`), holds the answer for five seconds, and
  drops it the moment an admin saves anything.
- **It travels with the room media bootstrap**, the same data that already
  carries the theme and sound of the room you are in, so the server and the
  browser draw from the same list and the first frame is still right. A
  member's comes from `loadRoomMediaBootstrap`. A guest's comes from
  `loadGuestMediaBootstrap`, the one door here open without an account
  (`src/app/open-endpoints.ts`), which also picks the guest's random free pair.
- **Pages read it with `useMediaCatalog()`** (`room-media-store.ts`): the
  Sounds and Theme pages, the room pickers, the room cards, the invite page,
  the profile banner picker and the plan cards' counts.
- **A saved choice is filled in from the list.** `resolveSoundReference` and
  `resolveBackgroundReference` attach the file, the name and the volume, so
  the player and the backdrop play what they are handed. An item the list does
  not have resolves to nothing, which is the fall-back above.
- **Every save checks the list on the server.** A personal room, a hosted room
  and a profile banner refuse an item that is not Live.

## The two pages

`/admin/pomodoro-themes` and `/admin/pomodoro-sounds`, one component
(`admin-catalog-dashboard.tsx`). `/admin/pomodoro-media` forwards to Themes.

- **A row** shows the picture, the name, its kind, a sound's length, Free or
  Pro, a note while a new file is being prepared or was refused, "No licence
  set" on a Live item with none, Draft or Live, and how many personal rooms and
  open rooms have it.
- **The name or the cog opens the window**, with `?open=<id>` in the address,
  so Back closes it. New theme or New sound opens it with `?open=new`.
- **A sound row has a play button** that plays in the page only and stops when
  another plays.
- **A tag filter** sits beside Draft or Live and Free or Pro once anything is
  tagged.
- **Ticked rows** get Delete, Free, Pro, Draft and Live. One press is one
  request, and the line afterwards counts what changed, what was already that
  way, and what could not go Live because it has no picture or no file.
- **Rows drag into the order members see** while the list is in that order,
  unfiltered and on one page. Otherwise a line under the table says so, with a
  button back to members' order.
- **Upload several** takes up to 25 files. Each becomes a Draft named after
  its file. On Sounds, a file outside 2 to 5 minutes is left out and counted.
  On Themes, a picture becomes a still at once and a film is prepared by the
  worker.

## The window

`admin-catalog-dialog.tsx`, three cards:

- **Details.** The name, the hint, the tags, the kind, Free or Pro, and Draft
  or Live. Tags are what members pick by on the By tag tab; see
  [Shuffle and tags](shuffle-and-tags.md).
  Making something Pro does not take it from a free member who already has it;
  it is checked the next time they pick.
- **Files.** The picture (the shared image field and media library), then the
  sound file or the theme's film, uploaded the moment it is chosen and prepared
  after Save. A sound has a starting volume from 10 to 100, multiplied into
  each member's own volume. A theme can drop its film and be a still again.
- **Credits.** Artist, source link, licence and a note. Only admins see them.

Delete sits hard left in the footer. It closes the window and asks in the
page's own confirm, which says how many people and open rooms have the item and
what they get instead. The item's uploaded files are removed from the bucket;
the built-in files under `public/` never are.

Going Live needs a picture, and for a sound a file (or one on its way). A
theme's film whose still was left empty gets its first frame as the still.

## The worker

`pomodoro-catalog-files` (`catalog-worker.ts`), one file per pass of the
shell's fifteen-second loop, apart from members' uploads so a long film never
holds theirs back.

- **A sound** is measured, refused outside 2 to 5 minutes, then evened out for
  loudness (`loudnorm`) into an MP3.
- **A film** is shrunk to 720p with no sound, and its first frame is taken for
  a still when there is none.
- **The item keeps its old file until the new one is ready.** A Live sound
  being replaced keeps playing; a refused replacement leaves the old one in
  place and says why in the window.
- **A worker with no FFmpeg** marks the file refused with that reason rather
  than trying again.

## The NEW label

A theme or sound made Live in the last 14 days shows NEW beside its name on the
member pages, in the same orange capitals as PRO. The days count from when it
first went Live (`published_at`), not from when it was made as a Draft or last
edited. The built-in items carry a 1 Jan 2026 date, so they never show it.

## Every change is on record

Each save, delete, price change, status change and reorder writes one
`pomodoro_audit_logs` row with the resource `catalog` in the same transaction.
