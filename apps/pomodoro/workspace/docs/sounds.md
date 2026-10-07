# Sounds

Eight ambient loops on `/sounds` — Lofi beats, Rain, Café ambience and Brown
noise free; Forest birds, Ocean waves, Fireplace and Soft piano for Pro —
with the player itself in the header, where it survives page changes.

## The page

Tyler sent a design on 7 Oct 2026 with "revamp the sound page", and
`sounds-page.tsx` is drawn to it.

- **A large title** and one line saying whose room an Add goes to (see
  [The personal room](personal-room.md)).
- **The loops are cards, four across** (two on a phone). Each shows its
  waveform picture cropped to a wide frame, then the name with an orange PRO
  on the same line for a Pro loop, and the hint under it.
- **A round dark button sits over the middle of the picture.** It shows play
  or pause for the card being previewed, a padlock on a locked one, and a
  play arrow on the others only while the mouse is over the card or it has
  keyboard focus. The sound in use in the room you are in has an orange
  outline.
- **A count line sits under the cards**, "1–8 of 8 sounds", with Prev, page
  numbers and Next beside it. The design showed 20 sounds over three pages;
  there are 8, so the pager stays hidden until there is a second page. The
  line and the pager are `CatalogPager` in `catalog-pager.tsx`, paged by
  `use-catalog-page.ts`, and the Theme page uses both.
- **"Your own" and "Generate your own" are cards below.** See
  [Your own backgrounds and sounds](own-media-uploads.md) and
  [AI backgrounds and soundscapes](ai-generation.md). The Theme page shares
  both.

## Clicking a card previews it

Tyler, 7 Oct 2026: "Right now clicking on sound plays it in the navigation and
it interfere with the start timer on the index page. Make it preview the sound
on the sound page only and add a button to be able to add it to your personal
room."

- **A click plays the loop on this page only**, through its own player
  (`use-preview-audio.ts`). The header's player, the timer and what is saved
  are never touched. Clicking again pauses it, and leaving the page stops it.
- **The previewed card shows "Add to my personal room"**, and "Add to this
  room" for the host of the room you are in. The rules are in
  [The personal room](personal-room.md).

## Adding one never starts it

Tyler's rule, 27 September 2026: "when I select a theme, it shouldnt play
right away. It should jsut be selected and the play happens when I press
play on the big button."

So adding a loop to your personal room only puts it there. The sound starts
when the timer starts, or when you press play in the header's player. Adding
a different loop while one is playing stops the one playing, because the
sound that is playing is always the room's sound. A host changing a hosted
room's sound is different: a sound that was playing crossfades into the new
one, so everybody in the room keeps hearing one sound.

## The engine

The audio lives outside React, in `src/lib/pomodoro/sound-engine.ts`: two
hidden `<audio>` decks created once per browser session and appended to
`<body>`. The old app owned the decks in a provider wrapping its whole tree;
this app cannot wrap the shell's tree, so the product header's control
(`sound-player-header.tsx`), the sounds page and
the timer all talk to the same module. React reads it through
`useSoundPlayer` (`useSyncExternalStore`).

- **Crossfades:** switching loops fades the new deck in over the old
  (`sound-fade.ts`, ported verbatim). Fades snap instantly under OS
  reduced-motion, and a wall-clock backstop finishes every fade even in a
  throttled background tab — that is what lets the sleep timer silence a
  hidden tab.
- **The timer drives it:** the hook announces running edges as
  `pomodoro:timer-running` window events. Start fades the selected loop in,
  pause or stop fades it out; only genuine edges count, so navigating (which
  remounts the timer hook) never fights a manual pause.
- **It follows the room you are in:** the room media store calls
  `followSound` whenever the room's sound changes, and the engine holds that
  loop. Adding a sound dispatches `choose`, which leaves the status paused.
  `select`, the event that means "start this one", comes only from the
  header's play button, the timer's running edge and the hosted room's
  clock.
- **A reload never autoplays.** The player hydrates paused; a browser that
  blocks playback shows "Your browser paused the sound. Press play to
  resume."
- **Sleep timer** (15/30/60 min, moon button) fades the sound out at its
  deadline and never touches the focus timer.
- **Completion alerts:** a two-tone chime (Web Audio, no file) plus a
  browser notification, switched on by the one checkbox in Settings →
  Timer — the only place notification permission is ever requested. A gate
  keyed on the countdown's end moment fires each alert exactly once
  (`completion-alerts.ts`, unit-tested).

## Saved state

Volume, mute, the alerts flag and the chimes live on `user_preferences`
(migration `0086_pomodoro_sound_preferences.sql`), saved debounced through
`src/lib/api/pomodoro/sounds.ts`. Which loop plays is not saved there: it
belongs to the personal room (`savePersonalRoomSound` in
`src/lib/api/pomodoro/personal-room.ts`). Adding a premium loop to the
personal room on a free account is refused server-side
(`UPGRADE_REQUIRED:premiumMedia`). A locked card leads
to the plans page, exactly as a locked scene does on
[Backgrounds](backgrounds.md): `/plans` for a member, sign-in first for a
guest, reachable by Tab, never a dead button. Audio files are first-party, copied from the old app into
`public/sounds/`.

## Turning the sound off

The power button at the end of the header's player is "Turn sound off". It
saves silence to your personal room, so the player leaves the header, and a
success toast says "Sound off. Pick one again on Sounds." with Sounds as a link
to `/sounds`. Pause is the play button beside it, and it keeps the sound. In
somebody's hosted room the power button is hidden, because the host picked the
sound for everybody.

The button used to be an X labelled "Stop sound". An X reads as "close this for
now", and people pressed it expecting a pause, then found their sound gone.
