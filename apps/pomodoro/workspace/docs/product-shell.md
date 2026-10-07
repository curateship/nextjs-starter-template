# The product shell (the frontend)

The member-facing app is its own world, matched to the old app side by
side: the `_pomodoro` layout route (`src/routes/_pomodoro.tsx`) wraps
every product page in `src/components/pomodoro/pomodoro-shell.tsx` — the
translucent blurred sidebar of pill links (Dashboard, Rooms, Pricing,
Theme, Sounds, Leaderboard, History, Tasks; Settings at the foot), the
transparent sticky header (brand; the glassy Timer / Leaderboard / Theme
pills in the middle; then on the right the sound player, the moon-knob colour
toggle, and Log in + orange Register or [the bell](notifications.md) and
[the account menu](account-menu.md)),
and the chosen scene as a 720px hero
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

## The header's controls

Tyler set these on 7 Oct 2026: "Increase the button size for the navigation by
10%. Move the audio player to the right. Make sure the audio player uses the
same ui styling as the button. The notification bell as well", then "the 3
tabs in should align to the middle" and "make the audio player more
transparent".

- **The three pills are 36px tall** with 15px words and an 18px icon. They were
  32px, 13.5px and 17px. 36px is the nearest of the four allowed heights to
  10% larger. `quickPillClass` in `quick-controls-header.tsx`.
- **Every header control is drawn on one glass.** `quickPillSurfaceClass` is the
  round shape, the border, the faint fill and the blur, shared by the pills, the
  sound player and the bell.
- **The sound player is one 36px pill on the right**, before the colour toggle,
  holding its 28px controls. Its fill and blur are lighter than the pills', so
  more of the picture shows through it.
- **The bell is a 36px glass circle.** The button is the shell's
  `NotificationCenter`, which this app never edits, so the classes reach it
  from a wrapper in `pomodoro-shell.tsx` (`bellPillClass`, written out in full
  because Tailwind only builds classes it can read in the source).
- **The pills sit in the middle of the header, over the ring, from 1440px
  up.** The groups either side of them grow at the same rate, so the pills are
  centred whenever the right-hand group fits in half of the room left over.
  With a sound playing it is wider than that below about 1900px, and the pills
  sit left of centre only as far as they must: 52px at 1600px and 132px at
  1440px, measured as a guest with a sound playing. Below 1440px the row can
  wrap, so the pills sit in the middle of the space between the brand and the
  right-hand group instead.
- **Nothing in the right-hand group shrinks.** Squeezed, "Log in" broke over
  two lines and the colour switch lost its width.

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

## Where signing in lands

**A member who signs in lands on the timer, not on the shell's `/home`.** The
shell's sign-in page sends everybody to `/home` unless the link carries a
return address, and `/home` is the shell's own member dashboard. Two things
stop a member ever seeing it:

- **Settings → General settings → Member home route is `/timer`.** `/home`
  forwards a member there before it draws anything, which covers every way in:
  the sign-in form, Google, a passkey, a new registration, and an email that
  links to `/home`. The field is a saved setting, not code, so it has to be set
  on each database. It was set locally on 6 Oct 2026 and is owed on live.
- **The header's Log in carries the page you were on.** Pressing Log in on
  History brings you back to History. The front page sends none, because
  Member home already lands on the timer.

Admins are forwarded by the Admin home route next to it instead, which is
empty and so opens the admin's Overview. Whether an admin should land on the
timer too is Tyler's call.

## One content width, 1,140px

Every member page holds its content to the same column: 1,140px wide on a big
screen, centred, and as wide as the frame allows on anything smaller, where the
16px page edge still applies. Tyler's rule, 7 Oct 2026: "The width of the main
content area is too narrow. Expand it 30% wider." He then chose one width for
every member page rather than a wider copy of each page's old one (Tasks and
Settings were 672px, History 768px, the timer and Rooms 860px, Plans 960px).

The width lives in one place, `contentColumn` in
`src/lib/pomodoro/content-column.ts`. A page writes that class and adds its own
gap and padding, never a `max-w-*` of its own. The timer, Tasks, History,
Rooms, Leaderboard, Sounds, Backgrounds, Settings, Plans, the people list and
the public profile all use it. The two invite cards keep their narrow
`max-w-md`, and the admin pages keep the shell's layout.

## The sign-in pages

**The ten signed-out pages draw inside the product shell:** sign in, register,
forgot and reset password, verify email, the sign-in link, change email and its
undo, reporting an unwanted sign-in, and maintenance. Before 6 Oct 2026 they
drew the shell's public site frame, so pressing Log in looked like leaving the
app.

- **The card is still the shell's.** Its fields, Google, passkeys, checks and
  redirects are the same code every app has. Only the frame around it is this
  app's: `src/components/pomodoro/sign-in-frame.tsx`, handed to the shell
  through `signIn.frame` in `src/app/options.ts`. The shell's route files are
  untouched.
- **The option lives in the shell.** `signIn.frame` was added to custom-shell
  for this, off by default, so every other app keeps the public frame until it
  sets one. The two shell files it changed, `app-options.ts` and
  `auth-shell.tsx`, are the same in both apps.
- **The card floats on the scene.** It sits 280px from the top, the way the
  timer ring does, rather than at the product's usual content height. At that
  height the form started 600px down a 900px window and its Google and passkey
  buttons fell below the fold. The Sign in button is on screen at every size
  from 320×640 up, measured.
- **Who is signed in is asked from the browser**, the way the shell's own
  public header asks, because these pages have no product loader. Most are
  reached signed out and show Log in and Register; change email, reached
  signed in, shows the account photo.
- **Maintenance gets the frame too.** During maintenance the left menu's links
  only lead back to the maintenance page, which Tyler accepted on 6 Oct 2026
  for one look everywhere.
- **Log in on one of these pages carries no return address.** Coming back to
  `/login` after signing in would bounce to `/home`, so the member home route
  decides instead.

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
- **Theme** says whose room the sound and theme belong to (your personal
  room, a hosted room, or a guest's random pair) and links to Sounds and
  Backgrounds. It picks nothing itself: since 7 Oct 2026 a sound or theme is
  previewed on its page first and then added. See
  [The personal room](personal-room.md).

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
  shell file conflicts on every future merge, so they stay where they are. The
  sign-in pages still get the product's frame, through a shell option; see
  "The sign-in pages" below.
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
