# The tab countdown

While a timer runs, the browser tab says how long is left and its icon fills
up like a ring. Both go back to normal the moment the timer stops.

## What you see

- **The title is the clock and the phase**, time first: `12:40 Focus`,
  `04:59 Short break`, `09:12 Long break`. Time first because a tab with six
  neighbours shows only its first few characters.
- **The icon is a ring that fills as the phase runs out**, empty at the start
  and full at the end, with a dot in the middle so a 16px icon still reads as
  something. Focus is the app's orange, both breaks are green.
- **Stopping puts both back.** Pause, Reset and picking another phase all
  count as stopping, and so does the phase running out with auto-start off.
- **Only running counts.** A paused timer shows the page's own title again,
  because nothing is counting down to report.

## Where it runs

The countdown belongs to the product shell
(`src/components/pomodoro/pomodoro-shell.tsx`), so it keeps going while you
move between Timer, Tasks, Rooms and the rest. The admin screens under
`/admin` are not inside that shell, so the tab there shows the normal title
while the timer carries on running underneath.

## Why it is built this way

- **The tick comes from a Web Worker**, not from the page
  (`src/lib/pomodoro/use-tab-countdown.ts`). Chrome slows a hidden tab's own
  timers to one a minute after five minutes in the background, and a title
  that lags a minute behind is worse than no title. A worker's interval is not
  slowed. Proof that it works: with `window.setInterval` and
  `window.setTimeout` deleted from the page, the title still advanced five
  seconds in five seconds.
- **Every tick works the time out from the moment the timer ends**, rather
  than counting down by one. A tick that arrives late writes the right number
  instead of a number that has drifted.
- **The title that comes back is the one the page wants now**, not the one
  found on the way in. A `MutationObserver` watches the `<title>` element, and
  any title we did not write ourselves becomes the title to restore. Without
  it, starting a focus on Timer and stopping it on Tasks would restore Timer's
  title onto the Tasks page.
- **The ring is drawn onto every icon link the page already has**, and the
  original addresses go back on stop. A browser handed several icons picks the
  size it wants, and that is not reliably the newest link, so drawing on one
  extra link of our own would sometimes show the ring and sometimes not.
- **The icon is redrawn once per whole percent**, not once per second. One
  second of a 90-minute focus moves the arc by a fifth of a degree, which no
  tab-sized icon can show.
- **The countdown never re-renders the app.** It writes to the document
  directly instead of holding React state, so a second passing costs one title
  assignment rather than a render of every screen.

## What it does not do

- A signed-in member's running timer does not survive a page reload, because
  the timer lives in the browser and a signed-in session is not written back
  to it. The tab is honest about that: after a reload there is no timer
  running, so there is no countdown. A guest's timer does survive, and the
  countdown comes back with it.
- The tab is not touched on the admin screens, as above.
