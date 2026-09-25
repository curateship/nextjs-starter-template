# Zen mode

Zen mode is the timer with everything else taken away. The screen holds two
facts, the time left and what you are working on, and nothing you could fiddle
with.

## Getting in and out

The square icon beside Reset, inside the ring on `/timer`, opens it. It is the
one icon on that screen whose picture does not say what it does, so it carries
a tooltip while Reset does not.

Three things leave it, and all three do the same work:

- The "Leave zen mode" button in the top right corner.
- Escape.
- The browser dropping fullscreen by itself, through F11 or its own exit
  button.

Leaving puts the keyboard focus back on the button that opened it.

## What is on the screen

The ring, the countdown, the phase (Focus, Short break, Long break) and the
focus task's name. The task name is shown during a focus and left off during a
break, because a break is not work on that task.

The leave button and the line at the bottom fade out about two and a half
seconds after the pointer stops. A move, a tap or a Tab brings them back, and
a focused control never fades at all.

A tap counts because a phone fires no mouse move and has no Escape key, so
without it a touch member would be left with no way out. While the controls
are faded they take no taps either, so the tap that brings them back can
never leave by accident.

The ring itself is the pause control, so zen mode needs no button of its own.
The line at the bottom says so.

While zen mode is up, every other part of the page is marked inert. The
shell's sidebar and header drop out of the tab order and out of a screen
reader's reach, which is what the screen already claims by being a modal.

## The scene behind it

The background you picked in Theme fills the whole screen, under a wash that
dims it. The dashboard shades the same picture differently, because there the
ring sits over the part of the hero that has already faded, and in zen mode it
sits over the middle of the picture. Both draw the same `<img>` or `<video>`
from `src/components/pomodoro/scene-backdrop.tsx`, so opening zen mode never
swaps the picture or restarts a video.

## The timer is never touched

The countdown, its session rows and the completion chime live in a
module-level engine (`src/lib/pomodoro/use-pomodoro.ts`) that runs whether or
not any screen is drawn. Zen mode only reads it and calls the same pause the
dashboard's Start button calls. So a focus that is running when you go in is
the same focus when you come out, the ring keeps ticking the whole time, and
the chime fires inside zen mode exactly as it would on the dashboard. The
phase advances to the break under you, on screen.

Checked on 25 Sep 2026 with a one-minute focus: the chime fired and the phase
turned to Short break without leaving zen mode, and the countdown at the
moment of leaving matched the dashboard's.

## Fullscreen is asked for, never required

Entering asks the browser for fullscreen on the page root. A browser that
refuses, an iframe without the fullscreen permission or a gesture the browser
did not accept, still gets the same overlay across the viewport. Nothing about
the screen depends on the request succeeding.

Zen mode only ever drops the fullscreen it asked for itself. Someone who
pressed F11 before opening it keeps that fullscreen when they leave.

## Where it is drawn

The overlay is portalled onto `<body>`, not left in the page. The product
shell wraps every page in a `z-[4]` box, which is its own stacking context, so
an overlay rendered inside it sits under the shell's header and sidebar
however high its own z-index climbs. The Pomoder tokens still resolve on
`<body>`, because `theme.css` declares them on the page root.
