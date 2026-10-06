# The product shell (the frontend)

The member-facing app is its own world, matched to the old app side by
side: the `_pomodoro` layout route (`src/routes/_pomodoro.tsx`) wraps
every product page in `src/components/pomodoro/pomodoro-shell.tsx` — the
translucent blurred sidebar of pill links (Dashboard, Rooms, Pricing,
Theme, Sounds, Leaderboard, History, Tasks; Settings at the foot), the
transparent sticky header (brand, the glassy Timer / Leaderboard / Theme
pills, the sound player, the moon-knob colour toggle, Log in + orange
Register or [the account menu](account-menu.md)), and the chosen scene as a 720px hero
that fades into the canvas on every edge. Pages overlap the hero's lower
half (the shell's -mt-40), which is what makes the timer ring float on
the image exactly like the old dashboard. **The product is dark by
default**: a first visit with no saved colour choice starts dark, and the
toggle still offers light. How dark the dark is belongs to Settings →
Appearance; see [The dark mode shade](dark-mode-shade.md).

## The colour toggle's knob

The moon-knob slides the 24px between its two ends over 300ms while the
moon and the sun turn past each other. Both icons are always on the page,
because a swap on arrival would have nothing to fade from.

The movement runs through `element.animate()`, not a CSS transition. The
shell's theme provider
(`src/components/shell/sticky-header/light-dark-switcher.tsx`) drops
`*{transition:none!important}` over the whole page for two frames while it
flips the class, so that nothing on the page cross-fades its colours, and
any CSS transition on the knob is caught by that rule and never plays. The
rule says nothing about animations, so a keyframe animation still runs.
That file belongs to the shell and is never edited from here, which is why
the knob works around it rather than turning the rule off.

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

## One page edge, and a header that fits a phone

**The header and the content under it take their left and right edge from one
value**, 24px under 640px wide and 40px from there up. Before this they were
`px-10` and `px-6 sm:px-12`, so the brand sat 8px inside the first heading on a
desktop and 16px outside it on a phone. 40px is the header's old number rather
than the content's 48px, because the row of controls fits a 1024px window with
40px of edge and needs a second line with 48px.

**The header row is allowed a second line.** It holds the menu button, the
brand, three pills, the whole sound player, the colour toggle and either the
account photo or Log in plus Register, and how much room that needs depends on
what is in it: the sound player only exists while a sound is chosen, and Log in
plus Register is wider than the photo. So no single breakpoint covers every
case, and the row wraps instead. A window wide enough for one line is unchanged, and the header's resting
height is still 86px.

**Below 768px a second line is not enough either**, so two things change:

- The three glassy pills drop their words and become their icons in a circle.
  The Timer pill keeps its countdown, because that is the reason to look at it.
  Every pill already carries its own `aria-label`, so hiding the words costs no
  name and the popovers are unchanged.
- The sound player folds behind one pill of the same kind. The pill says whether
  the sound is playing and names it, and the popover behind it holds the same
  six controls the wide row shows: play or pause, the name, mute, the volume
  slider, the sleep timer and stop. Nothing is removed on a phone, and from
  768px up the player is the inline row again.

768 and not 640 because 640 was measured: with the words back on, a 640px window
still scrolled sideways by 61px. The one place this needs JavaScript rather than
a media query is the sound player, where the two shapes are different markup
rather than one styled two ways, and `useNarrowScreen`
(`src/lib/pomodoro/narrow-screen.ts`) answers that. It starts wide so the server
and the browser draw the same first render, then measures before the browser
paints, so a phone never shows the wide shape in a frame anyone sees.

## The blur behind an open window

**When a window opens, the left menu stays where it is and blurs with the rest
of the page.** The shell blurs the whole page canvas behind any open window by
putting a `filter` on it. A filter on an element makes everything inside it
that is pinned to the window (`position: fixed`) pin to that element instead.
The product's left menu is pinned, so on a page scrolled down it jumped up and
off the screen the moment a window opened, such as the photo picker on
Settings. Tyler saw it on 6 Oct 2026.

The fix is in this app's `theme.css`, because the shell's `src/theme.css` is a
shell file. On a product screen the canvas keeps no filter, and the left menu
and the column beside it each get the same 4px blur. A filter on the pinned
menu itself does not move it. The blur switches on without the shell's 150ms
ease, because a transition there would replace the menu's own width
transition.

## The three header popovers

The glassy pills in the header each open a popover, and all three are
built from `src/components/ui/popover.tsx` with the Pomoder tokens doing
the colour, never a rebuilt panel. Each one is centred under the pill
that opened it, the way the old app placed them, and shifts inward only
when the window is too narrow to hold it.

- **Timer** is the settings panel: Start or Pause and Reset, a minute
  stepper for each of the three phases, Auto-start the next timer, and the preset
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

## Every member-facing screen goes under `_pomodoro`

**A new screen a member can reach is a route file under
`src/routes/_pomodoro/`, and nothing else.** Put it anywhere else in
`src/routes/` and it draws the shell's public frame: a different header, no
sidebar, no scene, different fonts. A person clicking a link in the product
sidebar then watches the whole page change shape, which is the one thing this
layout exists to prevent.

The addresses the shell keeps, and why they are the exception:

- `/login`, `/register`, `/pricing`, `/search` and the missing-page screen are
  the shell's own route files. Editing or moving one forks it, and a forked
  shell file conflicts on every future merge, so they stay where they are.
- The router refuses two routes at one address, so `src/routes/_pomodoro/x.tsx`
  cannot shadow `src/routes/x.tsx`. It fails the build with "Conflicting
  configuration paths", not quietly.
- **The way round it is a new address, not a second file.** The plans screen is
  the worked example: `/plans` under the layout, the sidebar pointing at it,
  the shell's `/pricing` left alone. See [The plans page](plans-page.md).
- They do share the accent colour. `src/app/options.ts` sets `publicTheme` to
  the Pomoder orange and the Pomoder corner radius, so buttons and focus rings
  match on both sides. It names only those two fields: a value saved in
  Settings → Styling replaces whatever is named there, and anything left out
  keeps the shell's own look.

Closing the seam for good needs a shell option that lets an app wrap the
signed-out pages in its own frame, which would mean changing
`apps/custom-shell`. That has not been done.

## Pages an admin added

Under the product's own screens, after a thin rule, the sidebar lists the links
an admin put in the public menu (Settings → Public → Navigation), so a page
written in the admin is reachable from inside the product. Groups are flattened
to their links, because a sidebar row is one address. A link marked desktop-only
or phone-only is hidden by a class at `lg`, the width the sidebar itself swaps
its rail for a drawer.

They are added below the product's screens and never replace them: a member
must not lose the timer because somebody edited a menu. The reader is
`src/lib/pomodoro/saved-menu.ts`. Such a link still leaves the product shell
when followed, for the reason above.

Pages under the layout: `/timer` (the dashboard), `/tasks`, `/plans`,
`/rooms`, `/leaderboard`, `/users`, `/sounds`, `/backgrounds`, `/history`,
`/settings` (focus rhythm + profile) and the public profiles at
`/u/<handle>`. The layout does not require sign-in: a guest gets the whole
product out of browser storage, and the first signed-in visit afterwards
imports it to the account once. See [Guest mode](guest-mode.md). Maintenance
mode holds for members the same way the shell's own layout does.

Why a mistake is worth recording: the first build hung these pages inside
the shell's admin layout, put the timer settings in the admin Settings
tabs and the player in the admin header. Tyler's rule, 25 Sep 2026: the
frontend is built like the pomoder app — its own shell — and the admin
side is not the product.
