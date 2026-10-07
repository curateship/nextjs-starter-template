# The personal room

Every page shows the sound and theme of the room you are in. Signed in,
that's your personal room unless you have joined or opened a hosted room.
Then it is the pair the host picked, until you leave.

## Tyler's rules, 7 Oct 2026

- "The index page when users are not logged in-the theme and sound should be
  randomize."
- "A personal room is a room that cannot be deleted and every has one by
  default."
- "When user create a personal room, they can select a sound and theme. The
  same goes for hosting a room as well. User must select sound and theme."
- Inside a hosted room everyone gets the room's pair, and "the index page will
  be replaced with the joined room".
- "Make it preview the sound on the sound page only and add a button to be
  able to add it to your personal room. Same for theme, I want to preview it
  first and then a button to add it to personal room."

## What a personal room is

- **Every account has exactly one.** It is a row in `pomodoro_personal_rooms`
  holding a sound and a theme (`src/server/pomodoro/schema.ts`). Accounts that
  existed on 7 Oct 2026 got theirs from migration
  `0122_pomodoro_personal_rooms.sql`, filled from the pair they had already
  picked. Any later account gets one the first time it is read
  (`loadOrCreatePersonalRoom` in `src/server/pomodoro/personal-room.ts`), so
  the shell's sign-up knows nothing about it.
- **It can't be deleted or closed.** There is no function that does either.
  It goes only when the account does.
- **Nobody else joins it.** It is not a row in `rooms`, has no invite link and
  never appears on the Rooms page.
- **It is what `/` and `/timer` show** when you are in no hosted room: the
  timer (`HomeRoom` in `src/components/pomodoro/home-room.tsx`).
- **A null sound is silence, and a null theme is the default scene**, Lofi
  girl. "Turn sound off" in the header's player saves silence.
- **The old columns stay.** `user_preferences.selected_sound` and
  `selected_background` are no longer written. They are kept because stored
  fields are never renamed or removed.

## Being in a hosted room

- **The room's pair replaces yours while you are in it.** Joining, hosting,
  or opening an invite link switches the backdrop, Zen mode and the header's
  player to the room's sound and theme. Leaving, being removed, or the room
  closing puts your own pair back. The room never writes over your personal
  room.
- **The front page becomes the room.** See [Focus rooms](rooms.md).
- **A host's change reaches everyone at once.** "Add to this room" on Sounds
  or Backgrounds saves the room's pair and sends a fresh snapshot, so every
  member's screen and sound change within a second.
- **The room's clock drives its sound.** The room's focus or break starting
  plays the room's sound, the way your own timer's Start does, and the room
  going back to waiting fades it out. A sound that was playing when the host
  changes it crossfades into the new one.
- **A member can't change the room's pair.** Pause, volume and mute still
  work. The power button is hidden in a hosted room, because taking the sound
  away is the host's to do.
- **Pro items play for everyone.** A free member hears and sees the Pro sound
  or scene a Pro host picked. The lock still holds for their own room.

## Guests

- **A guest gets a random free sound and theme on every visit.** The page's
  loader picks them (`guestMediaBootstrap` in `src/lib/pomodoro/media-pair.ts`),
  so the server draws the same pair the browser then holds and nothing swaps
  on the first frame.
- **Never a Pro item and never an upload**, since a guest owns neither.
- **What a guest adds lasts only until the next visit.** The button reads "Use
  for this visit". Nothing about the pair is kept in the browser any more.

## Previewing and adding

- **Clicking a sound on Sounds plays a preview on that page only.** It plays
  through its own player (`usePreviewAudio` in
  `src/lib/pomodoro/use-preview-audio.ts`), never through the header's player,
  so it can't fight the timer's Start. One preview plays at a time, and
  leaving the page stops it.
- **Clicking a theme on Backgrounds opens a popover** with the scene playing in
  it and the Add buttons under it. Tyler, 7 Oct 2026: "Clicking on the theme
  should open up a popover to preview the theme (not open it in the background
  like we do now)." The page behind never changes until a theme is added.
- **The Add buttons sit under the preview**, on the previewed sound card or in
  the theme's popover (`MediaAddActions` in
  `src/components/pomodoro/media-add-actions.tsx`):
  - "Add to my personal room" saves it to your own room.
  - "Add to this room" is shown only to the host of the room you are in, and
    changes it for everyone in it.
  - A member of somebody else's room gets neither. The top of the page says
    the host picked the pair.
- **The item in use in the room you are in is labelled "Currently selected"**,
  over its picture, and outlined in orange. Tyler asked for the label on
  7 Oct 2026. Sounds, Backgrounds and your own uploads all carry it
  (`CurrentlySelectedLabel` in `media-add-actions.tsx`).
- **The header's Theme pill no longer picks anything.** It says whose room the
  pair belongs to and links to Sounds and Backgrounds.

## A hosted room takes catalogue items only

Host a room asks for a sound and a theme, and both are required. They come
from the eight loops and the eight scenes. A host's own uploads are left out,
because an upload is served from a public address and anyone who joins would
see or hear it (`roomPairProblem` in `src/lib/pomodoro/media-pair.ts`). Whether
an unlisted room may use one is still Tyler's to decide.

## How the page knows

- **The loaders read it first.** `/` (`landing-page.tsx`) and every product
  page (`src/routes/_pomodoro.tsx`) read the personal room and the hosted room
  you are in with `loadRoomMediaBootstrap`
  (`src/lib/api/pomodoro/personal-room.ts`).
- **The browser takes that answer into one store** before its first render
  (`src/lib/pomodoro/room-media-store.ts`). Every reader works out what to draw
  from that store: the backdrop, Zen mode, the Theme pill, both pages and the
  header's player. The sound engine follows the store through `followSound`
  and keeps only volume, mute, the alerts and the chimes of its own.
- **A failed read draws the default scene with no sound**, and the next page
  load asks again.
