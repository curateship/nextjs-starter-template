# The product shell (the frontend)

The member-facing app is its own world, matched to the old app side by
side: the `_pomodoro` layout route (`src/routes/_pomodoro.tsx`) wraps
every product page in `src/components/pomodoro/pomodoro-shell.tsx` — the
translucent blurred sidebar of pill links (Dashboard, Rooms, Pricing,
Theme, Sounds, Leaderboard, History, Tasks; Settings at the foot), the
transparent sticky header (brand, the glassy Timer / Leaderboard / Theme
pills, the sound player, the moon-knob colour toggle, Log in + orange
Register or the account actions), and the chosen scene as a 720px hero
that fades into the canvas on every edge. Pages overlap the hero's lower
half (the shell's -mt-40), which is what makes the timer ring float on
the image exactly like the old dashboard. **The product is dark by
default**: a first visit with no saved colour choice starts dark, and the
toggle still offers light.

## Collapsing the sidebar

Below Settings sits **Collapse**, a row drawn like the nav links, with a
chevron that points left when the sidebar is open and right when it is
shut. Pressing it narrows the sidebar from 224px to 76px: the labels and
the wordmark go, the icons stay where they were, and the page beside it
widens to match. Every link keeps a `title`, so hovering an icon in the
narrow sidebar still names the page.

Collapse is a desktop control and is hidden below the `lg` width. On a
phone the sidebar is a drawer that is either open or gone, so a
half-width state would mean nothing there. The choice is not saved: it
lasts as long as the page does, the same as the old app.

## The three header popovers

The glassy pills in the header each open a popover, and all three are
built from `src/components/ui/popover.tsx` with the Pomoder tokens doing
the colour, never a rebuilt panel. Each one is centred under the pill
that opened it, the way the old app placed them, and shifts inward only
when the window is too narrow to hold it.

- **Timer** is the settings panel: Start or Pause and Reset, a minute
  stepper for each of the three phases, Auto-start next, and the preset
  list with the one in use filled in. The steppers and the presets go
  dead while a timer runs, because changing a length mid-session would
  change what the countdown means. The pill itself shows the countdown
  instead of the word "Timer" once a session is going.
- **Leaderboard** shows this week's top five, read from the real
  ranking. Only accounts that opted in and chose a public display name
  are in it, so no real name ever appears; your own row is in the accent
  colour. Signed out, it says so rather than showing an empty list, and
  it loads when the popover is first opened rather than on every page.
- **Theme** holds the free sounds and the first three scenes, each with
  Upload and AI Generate beneath it. Those two are shortcuts, not the
  thing itself: both open the full page, because choosing a file and
  writing a prompt need more room than a popover has.

**The Custom Shell's admin chrome never appears on the frontend, and the
frontend's look never reaches the admin.** The `data-pomodoro-screen`
marker sits on the product shell's root, so the Pomoder tokens
(`theme.css`) cover the sidebar and header too; admin routes stay under
`_authenticated` with the stock shell look. The app borrows nothing from
the shell's signed-in chrome — `src/app/options.ts` is empty again.

Pages under the layout: `/timer` (the dashboard), `/tasks`, `/sounds`,
`/backgrounds`, `/history`, `/settings` (focus rhythm + profile). The
layout requires sign-in for now and forwards to `/login`; guest mode and
the public landing page are their own tasks. Maintenance mode holds for
members the same way the shell's own layout does.

Why a mistake is worth recording: the first build hung these pages inside
the shell's admin layout, put the timer settings in the admin Settings
tabs and the player in the admin header. Tyler's rule, 25 Sep 2026: the
frontend is built like the pomoder app — its own shell — and the admin
side is not the product.
