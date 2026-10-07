# Timer settings and rhythm presets

The Timer tab of the product's Settings page (`/settings`, card
`src/components/pomodoro/timer-settings-panel.tsx`) holds the old app's
"Focus rhythm" card: the three durations (1-90 minutes each), the daily goal
(1-20), how many focuses come before the long break (2-8), auto-start, and the
rhythm presets. The long-break number has its own doc,
[Sessions before the long break](sessions-before-long-break.md).

## The tabs on Settings

Settings is five tabs rather than one long column, so you open the part you
came for (`src/components/pomodoro/settings-page.tsx`, the list in
`src/lib/pomodoro/settings-tabs.ts`):

- **Timer**: the focus rhythm card this doc describes.
- **Appearance**: the dark mode shade. See [The dark mode shade](dark-mode-shade.md).
- **Profile**: the photo, display name, timezone and the two switches. See
  [Profile](profile.md).
- **Public page**: the card that publishes `/u/<handle>`. See
  [The public profile](public-profile.md).
- **Privacy**: [blocked people](reporting-and-blocking.md) and the
  [streak badge](streak-badge.md).

The chosen tab is in the address, `/settings?tab=public`, so a link can open one
tab and Back steps between them. Timer is the plain `/settings`, and an unknown
`tab` falls back to it. A guest gets Timer, Appearance and Profile, and their
Profile tab is the "Sync across devices" card asking them to sign in. A guest
sent to a members-only tab sees Timer. The tabs are the shared `ui/tabs.tsx`
pills, h-8, and arrow keys move between them. On a phone the row scrolls
sideways inside itself rather than pushing the page wider.

## Presets

- **Three built-ins live in code** (`src/lib/pomodoro/timer-presets.ts`),
  ids and values part of the product contract: Classic 25/5/15 with the long
  break after 4, Deep Work 50/10/30 with the long break after 2, Study Sprint
  15/3/10 after 4 with auto-start.
- **Custom presets** (name, three durations, the long-break number,
  auto-start) live in the `user_timer_presets` table (migrations
  `0084_pomodoro_timer_presets.sql` and
  `0099_pomodoro_sessions_before_long_break.sql`),
  at most 10 per person, names unique per person regardless of case. The
  server locks the owner's row per change, so two simultaneous creates can
  never both pass the count or name checks
  (`src/server/pomodoro/timer-presets.ts`).
- **The picker shows "Custom"** when the current five values match no
  preset, and names the match when they do. A preset row's small print reads
  `25 · 5 · 15 · long after 4`, plus `· auto` when it auto-starts.
- **Applying goes through the server** (`applyTimerPreset` in
  `src/lib/api/pomodoro/timer-presets.ts`), which refuses with
  TIMER_RUNNING while a focus session is genuinely mid-countdown — a
  running row whose end moment is still ahead. A stale paused row from a
  closed tab does not block it. Deleting a preset removes only the stored
  preset, never the saved preferences or a timer in progress.
- **The header's Timer popover lists your own presets after the built-ins.**
  If your own fail to load, the popover still lists the built-ins and says
  under them that yours could not be loaded, with Try again. It used to drop
  the failure in silence, so four saved rhythms looked as if they had been
  deleted (`quick-controls-header.tsx`).

The tab edits the same `user_preferences` row the dashboard reads on load,
so the next visit to `/timer` picks the new rhythm up.

## The number boxes

The three minute boxes are one component, `RhythmMinutesFields` in
`src/components/pomodoro/rhythm-minutes-fields.tsx`, used here, in a custom
preset's editor and in the host-a-room dialog. The same triple was copied into
all three before, and the copies drifted: two guarded a cleared box and one
did not, so clearing the same field showed an empty box on one screen and the
word `NaN` on another.

Each box is `src/components/ui/number-field.tsx`, and every number box in the
Settings card is — the daily goal and the long-break count too.

- **A cleared box is a half-typed state, not an error.** Select the 25, delete
  it, type 30: the box is briefly empty, which is fine, and it never says
  `NaN`.
- **Save stays pressable while a box is empty.** The field only hands back a
  whole number inside its limits, so the form keeps the last good value and
  saves that. The rulebook's rule is to keep the action enabled and answer on
  the press, never to grey it out.
- **The box marks itself** with `aria-invalid` while what is in it is not a
  usable number, and leaving it says what a usable number would be.

## How a save reports itself

Every save in Settings reports the same way, through the shared toasts. Three
cards on this one page used to report the same event three different ways and
two of them never cleared, so "Focus rhythm saved." sat beside the button for
the rest of the visit.

- **A save that worked raises a success toast** (`toast.success`), which
  clears itself.
- **A save that failed raises the shared error toast**
  (`src/lib/toast/error-toast.ts`), which stays until it is dismissed, because
  a failure you did not see is a failure you think did not happen.
- **No inline notice sits beside a Save button.** The `notice` and `error`
  state behind those lines is gone rather than kept alongside the toasts.
- **A load that failed is not a save that failed.** It still decides whether
  the fields are drawn at all, so it keeps a piece of state of its own and
  also says so in the error toast.
- **Validation that stops a save before it is sent stays in the form**, marked
  with `aria-invalid` on the field it belongs to.

## While it is loading

The card shows "Loading your focus rhythm…" in place of the preset picker and
the number fields until the saved row arrives. Three empty boxes read as a
rhythm of nothing, and a number typed into one of them would be overwritten the
moment the load landed. If the load fails the card says so, inside the card,
with a Try again button that runs the same load again without reloading the
page, instead of spinning for ever. The preset list under it does the same
with its own Try again. The Profile tab does the same with its own fields
for the same reason.
