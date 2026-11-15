# The floating timer

The floating timer is a small window that stays on top of every other app
while you work. It holds the time left, a thin ring, the phase, the task the
focus counts on, and one Start or Pause button, over your own background
faded the way zen mode fades it. Tyler picked it on 7 Nov 2026, free for
everyone, guests included.

## It opens by itself

Tyler, 7 Nov 2026: "The floating timer should be automatic. I shoudlnt need to
press any button."

- **When a focus starts.** Start on the ring, Space, or Start in the header
  opens the window as the focus begins. A browser only opens one straight
  after a press or a key, and that press is the one it counts. A focus started
  on another device arrives with no press on this one, so it opens nothing
  here.
- **When you switch tabs while the timer runs**, in Chrome where it offers it.
  Chrome sends a page playing sound an "enter picture-in-picture" call as you
  leave it, and lets that call open the window with no press.
- **Closed stays closed until the next focus starts.**
- **Each member can switch it off** in Settings → Timer, "Floating timer",
  under Completion alerts. On for everyone until they do (Tyler, 7 Nov 2026:
  "I can enable or disable the floating timer in settings"). It saves the
  moment it is flipped: to the account (`user_preferences.floating_timer`,
  migration `0165`), and in the browser for a guest. Off, the window never
  opens by itself; the header button still opens it.

## Opening it by hand

- **The button is in the header's timer dropdown**, beside Reset, with the
  tooltip "Floating timer: a small window on top of your other apps". The
  dropdown is on every page, so the window opens from anywhere.
- **It is not in the ring.** The ring's button row on a break already holds
  Reset, the break's play button, Skip break and Zen mode, and the Skip break
  pill was narrowed so it would not press against the ring. A fifth button
  would not fit.
- **Only Chrome, Edge and Arc can float a window.** It is the browser's
  Document Picture-in-Picture window. Safari and Firefox do not have one, so
  the button is not drawn there at all, rather than drawn and doing nothing.
- **Inside a room the button is not offered.** The header shows the room's
  clock then, and the floating window follows your own timer, not the room's.
- **Pressing it again brings the open window forward.** There is only ever one.

## How it looks

- **The background is yours, faded.** The same scene or upload the timer
  page shows, under zen mode's fade, and the break's background on a break.
- **The ring is 140px across and the time 24px.** At 28px in a 120px ring the
  time ran into the ring (Tyler, 7 Nov 2026: "The number is too big that it
  goes to the edge"). Measured since: "22:40" is 69px wide inside a 100px
  opening.

## How it keeps time

- **The window holds no timer of its own.** Its contents are drawn from the
  page through a portal, reading the same engine the ring reads, so the two
  can never show different times. Pausing in either place pauses both.
- **It belongs to the Pomoder layout, not the timer screen.** Moving between
  pages keeps the window and its time. Closing the window, or closing the tab
  it came from, ends it.
- **It dresses like the page.** The page's stylesheets are copied into the
  window when it opens, the two fonts are loaded into it, and switching dark
  mode or the dark shade on the page switches the window too.

## Where it lives

- `src/components/pomodoro/floating-timer.tsx`: the window, the button's
  `openFloatingTimer` and `useFloatingTimerSupported`, and `FloatingTimerHost`,
  mounted once in `pomodoro-shell.tsx`, which also opens it by itself.
- `src/lib/pomodoro/floating-timer-setting.ts` and
  `src/lib/api/pomodoro/floating-timer.ts`: the member's switch.
- `src/components/pomodoro/quick-controls-header.tsx`: the button.
- `src/components/pomodoro/fonts.ts`: `loadPomodoroFonts` takes the window's
  document, because a blank window has no address to load `/fonts` from.
