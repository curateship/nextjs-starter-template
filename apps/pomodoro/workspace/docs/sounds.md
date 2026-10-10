# Sounds

The Live sounds from the catalogue on `/sounds`, free and Pro, in the order an
admin set. The player sits under the clock, the sound survives page
changes, and the header's timer pill shows music bars that mute it from any
page. An admin adds and edits them on the Sounds admin page; see
[Themes and sounds in the admin](catalog-admin.md). Eight shipped with the app:
Lofi beats, Rain, Café ambience and Brown noise free; Forest birds, Ocean
waves, Fireplace and Soft piano for Pro.

- **One grid of cards**, with the tag filter and Shuffle pills beside the
  title. See [Shuffle and tags](shuffle-and-tags.md). Cards sit 24px apart on a
  wide screen and 16px on a phone, the same on Sounds and Theme (Tyler, 9 Oct
  2026: "add a bigger gap between the theme cards, match that same gap with
  sound cards too").
- **A sound added in the last 14 days shows NEW** beside its name, in the
  same orange capitals as PRO. The days count from when it first went Live.
- **A sound plays at its starting volume** times the member's own, so a loud
  track an admin turned down starts quieter.

## The page

Tyler sent a design on 7 Oct 2026 with "revamp the sound page", and
`sounds-page.tsx` is drawn to it.

- **A large title** and one line saying whose room an Add goes to (see
  [The personal room](personal-room.md)).
- **The loops are cards, four across** (two on a phone). Each shows its
  waveform, then the name with an orange PRO on the same line for a Pro loop,
  and the hint under it.
- **The waveform is drawn, not a picture.** Tyler, 10 Oct 2026: "replace it
  with a soundwave animation when play ... static until played", then a
  design to copy, "should be smaller". Forty-four thin rounded bars across
  the card, red into amber (`--p-wave-from` and `--p-wave-to` in
  `theme.css`), on a dusky purple-to-charcoal panel that turns pale in light
  mode. The bars swell into three smooth humps of different heights, with
  dips between them, take up under half the panel's height, and end in a
  row of dots at each side. The humps come from the sound's key, so every
  sound has its own shape and keeps it
  (`SoundWave` in `src/components/pomodoro/sound-wave.tsx`). While the sound
  plays the bars rise and fall on the header's `pomodoro-equaliser`
  movement, each bar at its own speed; when it stops they settle back.
  Reduced motion keeps them still. A member's own sounds on My uploads and
  the admin's Sounds list use the same drawing.
- **A round dark button sits over the middle of the waveform.** It shows play
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

## Clicking a card plays it

Tyler, 7 Oct 2026: "Make it preview the sound on the sound page only and add a
button to be able to add it to your personal room." On 9 Oct a sound also
played on hover, and on 10 Oct that went, because the hover and the click
fought: "Just remove the hover to play and keep the click to play sound. This
goes for the sound library as well."

- **A click or tap plays the loop on this page only**, through its own player
  (`use-preview-audio.ts`), and a second click stops it. Moving the pointer
  off the card does not stop it. The header's player, the timer and what is
  saved are never touched.
- **Hovering shows the play button and nothing more.** The same goes for a
  member's own sounds on My uploads. Themes still play on hover, because a
  film makes no sound.
- **The "+" in the card's bottom-right corner opens the Add choices**
  (`MediaAddMenu` in `media-add-actions.tsx`): "Add to my personal room", and
  "Add to this room" for the host of the room you are in. A choice already
  made reads "In your personal room" with a tick. A locked card has no "+",
  and nor does anybody in somebody else's room. Your own uploads have the "+"
  beside the delete button. The rules are in
  [The personal room](personal-room.md).

## The player sits under the clock

Tyler, 9 Oct 2026: "We need to do something about the sound player in the
navigation ... I think we should remove this from navigation and move it
somewhere around the timer." So the player left the header on every page and
is a row under the clock it follows (`SoundPlayerRow` in
`src/components/pomodoro/sound-player-row.tsx`): under the timer's ring on the
front page, and under the room's ring in a room.

It is drawn to Tyler's design of 9 Oct 2026 ("redesign the sound bar"), then
"remove the turn sound off icon", "remove the divider" and a tenth smaller
than the design ("trt 10% instead"): play or pause in a 28px round tinted
button, the sound's name in 13.5px semibold, next (for a shuffle or tags
choice) and the speaker in grey, a 72px grey volume slider with a 14px knob,
and the sleep timer's moon. On a phone the name is cut shorter so the bar stays
on one line. With no sound chosen it reads "No sound · Pick one", with Pick one
opening Sounds.

One rule between the two:

- **The timer leads.** Starting or resuming a focus plays the sound; pausing,
  or a break starting, fades it out (`runningEdge` in `sound-engine.ts`).
- **The row's play and pause only turn the sound on or off**, and never start,
  pause or reconnect the timer. A sound paused by hand during a focus comes
  back with the next start. Checked in a real browser on 9 Oct 2026: eleven
  presses of the two buttons in turn, and the timer only ever moved for its own
  button.
- **Away from the timer**, on Tasks, Sounds or Backgrounds, there is no
  player: the sound carries on, and the music bars in the header mute it and
  set its volume (next section).

## The music bars in the header

Tyler, 10 Oct 2026: "Add an animated music icon playing here when a sound is
playing so user can mute the sound." Asked whether it should be a pill of its
own: "The timer and music bar is one button."

- **They live inside the timer pill**, at its right end, as a second button in
  the same glass shape (`SoundBarsButton` in `quick-controls-header.tsx`).
  Pressing the timer half still opens Timer settings.
- **They show only while a sound plays**, or is loading. A paused sound, a
  break, or no sound at all puts the pill back to the timer on its own.
- **A press mutes, a second press unmutes.** It is the same mute as the
  speaker under the clock, so muting on Tasks shows muted on the timer page,
  and the other way round. Muted, the bars turn into a crossed-out speaker.
- **The volume opens on its own**, as a small glass dropdown under the bars:
  on hover with a mouse, after holding a finger on the bars for half a second
  on a phone, or with the arrow keys, which step it by 5 out of 100. It is the
  same slider as the one under the clock (`VolumeSlider`), moving the same
  value. A held finger that opened the volume does not also mute.
- **The bars stand still** for anyone whose device asks for less movement.
- **The pill stays 36px tall**, and the header is no taller with the bars than
  without them: 120px at 320px wide, 136px at 768px, and 86px at 1280px and
  1440px, measured on 10 Oct 2026.

## Adding one never starts it

Tyler's rule, 27 September 2026: "when I select a theme, it shouldnt play
right away. It should jsut be selected and the play happens when I press
play on the big button."

So adding a loop to your personal room only puts it there. The sound starts
when the timer starts, or when you press play in the player under the clock. Adding
a different loop while one is playing stops the one playing, because the
sound that is playing is always the room's sound. A host changing a hosted
room's sound is different: a sound that was playing crossfades into the new
one, so everybody in the room keeps hearing one sound.

## The engine

The audio lives outside React, in `src/lib/pomodoro/sound-engine.ts`: two
hidden `<audio>` decks created once per browser session and appended to
`<body>`. The old app owned the decks in a provider wrapping its whole tree;
this app cannot wrap the shell's tree, so the player under the clock
(`sound-player-row.tsx`), the sounds page and
the timer all talk to the same module. React reads it through
`useSoundPlayer` (`useSyncExternalStore`).

- **Crossfades:** switching loops fades the new deck in over the old
  (`sound-fade.ts`, ported verbatim). Fades snap instantly under OS
  reduced-motion, and a wall-clock backstop finishes every fade even in a
  throttled background tab — that is what lets the sleep timer silence a
  hidden tab.
- **The play button answers at once; the sound fades.** Tyler, 9 Oct 2026:
  "there is a slight delay when clicking start and stop the player", then
  "just remove the delay but keep the fade". Pause turns the button to Play
  the moment it is pressed (a `pause` event in `sound-player.ts`) while the
  sound fades out over the usual 1.4 seconds; it used to wait for the fade to
  end. Play turns it to Pause at once while the file arrives and fades in; the
  spinner shows only if the file takes over a second. Pressing Play during a
  fade-out brings the same sound back up (`playSource` says "playing" itself,
  because the audio never stopped).
- **The timer drives it:** the hook announces running edges as
  `pomodoro:timer-running` window events, with the mode. A focus starting
  fades the selected loop in; a pause, a stop or a break starting fades it
  out. Only genuine edges count, so navigating (which remounts the timer
  hook) never fights a manual pause.
- **A break is quiet.** Tyler, 8 Oct 2026: "Change it so that break turns the
  sound off." The sound fades out when a break starts, on your own timer and
  in a room, and fades back in when the next focus starts. Play in the
  header still plays it during a break for anyone who wants it.
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

There is no turn-off button. Tyler removed the player's power button on
9 Oct 2026 ("remove the turn sound off icon"); pause and mute are the ways to
silence it, and it only plays during a focus. A personal room saved as silence
(`none`) before that still shows "No sound · Pick one" under the clock.

## Dragging near the top of the page in Arc

The volume that opens from the header's music bars sits in the same strip, so
this applies to it too.

Tyler, 9 Oct 2026, on localhost in Arc: dragging the header's volume knob
worked "but it also drags my browser", and "its the whole navigation area".
This is Arc's own behaviour, not Pomoder's: with its toolbar hidden, Arc lets
you move the window by grabbing the top bar of any site, so the page reads as
part of the window. Nothing in Pomoder marks anything as a window handle (no
`app-region` rule anywhere in the loaded CSS). Marking the header controls
`app-region: no-drag` was tried the same day and Arc ignored it, so it was
taken out. No page can switch the behaviour off; it does not happen in Chrome,
Safari or Firefox.
