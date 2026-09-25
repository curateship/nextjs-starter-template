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
