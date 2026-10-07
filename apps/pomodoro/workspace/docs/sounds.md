# Sounds

Eight ambient loops on `/sounds` — Lofi beats, Rain, Café ambience and Brown
noise free; Forest birds, Ocean waves, Fireplace and Soft piano for Pro —
with the player itself in the header, where it survives page changes.

## Picking one never starts it

Tyler's rule, 27 September 2026: "when I select a theme, it shouldnt play
right away. It should jsut be selected and the play happens when I press
play on the big button."

So picking a loop, on `/sounds`, in the header's Theme popover or from your
own uploads, only picks it. The sound starts when the timer starts, or when
you press play in the header's player. Picking a different loop while one
is playing stops the one playing, because the sound that is playing is
always the sound that is chosen.

Picking the loop that is already chosen is not a choice, so that one
toggles play and pause, and only the chosen card and row carry a play
button. Every other card shows a tick as you hover it, not a play arrow,
because clicking it will not play anything.

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
- **Choosing is silent:** `selectSound` dispatches `choose`, which leaves
  the status paused. `select`, the event that means "start this one", comes
  only from the header's play button and from the timer's running edge.
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

Choice, volume, mute and the alerts flag live on `user_preferences`
(migration `0086_pomodoro_sound_preferences.sql`), saved debounced through
`src/lib/api/pomodoro/sounds.ts`. Saving a premium loop on a free account is
refused server-side (`UPGRADE_REQUIRED:premiumMedia`). A locked card leads
to the plans page, exactly as a locked scene does on
[Backgrounds](backgrounds.md): `/plans` for a member, sign-in first for a
guest, reachable by Tab, never a dead button. Audio files are first-party, copied from the old app into
`public/sounds/`.

## Turning the sound off

The power button at the end of the header's player is "Turn sound off". It
forgets the chosen loop (`clearSound`), so the player leaves the header, and a
success toast says "Sound off. Pick one again on Sounds." with Sounds as a link
to `/sounds`. Pause is the play button beside it, and it keeps the choice.

The button used to be an X labelled "Stop sound". An X reads as "close this for
now", and people pressed it expecting a pause, then found their sound gone.
