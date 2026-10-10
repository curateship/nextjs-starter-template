# The product shell (the frontend)

The member-facing app is its own world, matched to the old app side by
side: the `_pomodoro` layout route (`src/routes/_pomodoro.tsx`) wraps
every product page in `src/components/pomodoro/pomodoro-shell.tsx` — the
translucent blurred sidebar of pill links (Dashboard, Rooms, Pricing,
Theme, Sounds, Leaderboard, History, Tasks; Settings at the foot), the
transparent sticky header (brand; the glassy Timer / Leaderboard / Theme
pills in the middle; then on the right Log in + orange Register or
[the bell](notifications.md) and [the account menu](account-menu.md)),
and the chosen scene as a 720px hero
that fades into the canvas on every edge. Pages overlap the hero's lower
half (the shell's -mt-40), which is what makes the timer ring float on
the image exactly like the old dashboard. **The product is dark by
default**: a guest is always dark, and a member with no saved choice starts
dark and can switch to light. How dark the dark is belongs to Settings →
Appearance; see [The dark mode shade](dark-mode-shade.md).

## Light and dark

Tyler, 10 Oct 2026: "Move the theme switcher into the user dropdown. Hide it
on anon users." Then: "The light and dark goes into user dropdown and guess
always get dark mode."

- **There is no light/dark switch in the header.** A signed-in member flips
  it with the Dark mode row in [the account menu](account-menu.md), or on
  Settings → Appearance. The moon-knob pill that used to sit left of the bell
  is gone.
- **A guest is always dark**, whatever their computer is set to and whatever
  this browser stored before (`useGuestsStayDark` in
  `src/lib/pomodoro/guest-theme.ts`). The shell's "d" key does not turn a
  guest light either: any change away from dark while signed out is put
  straight back.
- **A member's own choice survives signing out.** Signing out sets it aside
  under `pomoder-signed-in-theme` before the page goes dark, and signing in
  gives it back. A member with no choice yet starts dark.
- **Nothing changes until the page knows who is signed in.** The sign-in pages
  and the pages an admin wrote ask from the browser (`useSignedInUser`), and
  the rule waits for that answer, so a member is never drawn as a guest for a
  moment.
- **An admin's fixed colour mode still wins.** Settings → Public → Styling →
  Colour mode set to "Always light" or "Always dark" fixes every page,
  guests included, and the account menu's Dark mode row goes, as the
  setting's own hint says ("A fixed mode hides their switch"). The fixed mode
  is applied by the shell's root (`forcedTheme` in `src/routes/__root.tsx`),
  which this app never edits.
- **A guest who chose light before 10 Oct sees light for a moment** on their
  first visit after this change, until the page starts in the browser. The
  stored word is dark from then on.

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
  round shape, the border, the faint fill and the blur, shared by the pills and
  the bell.
- **The sound player is not in the header any more.** Tyler moved it under
  the clock on 9 Oct 2026; see "The player sits under the clock" in
  [Sounds](sounds.md).
- **The timer pill carries music bars while a sound plays.** Tyler, 10 Oct
  2026: "Add an animated music icon playing here when a sound is playing so
  user can mute the sound", and "The timer and music bar is one button". The
  pill is one glass shape holding two buttons: the timer half opens Timer
  settings, and the bars at its right end mute and unmute. The details are in
  "The music bars in the header" in [Sounds](sounds.md).
- **The three dropdowns are frosted glass.** Tyler, 10 Oct 2026: "Add the
  currant background scene under the dropdown here". Timer settings,
  Leaderboard and Theme draw their surface at 72% of the popover colour with
  a 20px blur, so the scene shows through blurred and the words stay
  readable over a bright one (`quickPopoverGlassClass` in
  `quick-controls-header.tsx`). The class is put on this app's three
  `PopoverContent` calls, never in the shell's popover file.
- **The bell is a 36px glass circle.** The button is the shell's
  `NotificationCenter`, which this app never edits, so the classes reach it
  from a wrapper in `pomodoro-shell.tsx` (`bellPillClass`, written out in full
  because Tailwind only builds classes it can read in the source).
- **The pills sit in the middle of the header, over the ring, from 1440px
  up.** The groups either side of them grow at the same rate, so the pills are
  centred whenever the right-hand group fits in half of the room left over.
  Below 1440px the row can
  wrap, so the pills sit in the middle of the space between the brand and the
  right-hand group instead.
- **Nothing in the right-hand group shrinks.** Squeezed, "Log in" broke over
  two lines.

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
brand, three pills and either the bell and the account photo or Log in plus
Register, and how much room that needs depends on what is in it: Log in
plus Register is wider than the photo. So no single breakpoint covers every
case, and the row wraps instead. A window wide enough for one line is unchanged, and the header's resting
height is still 86px.

**Below 768px a second line is not enough either**, so the header keeps only
the Timer pill in the middle, without its word. It keeps its countdown and its
music bars, because those are the reasons to look at it. Leaderboard and Theme
are not drawn at all. Tyler, 10 Oct 2026: "remove the leaderboard and theme
button in mobile". Both pages stay one tap away in the left menu
(`phoneHiddenClass` in `quick-controls-header.tsx`).

**The menu button is the header's glass circle**, 36px, with the same border,
fill, blur and hover as the bell and the pills. Tyler, 10 Oct 2026: "add a
background to the hamburger icon so that it matches with the other buttons on
the menu". It shows below 1024px, where the left menu becomes a drawer.

**A guest on a phone sees one orange Log in, and no Register.** Tyler,
10 Oct 2026: "in mobile. dont show login and register. just show only login
in primary button". From 768px up it is the plain Log in link and the orange
Register, as before. Both Log in versions carry the page you were on, and the
sign-in page links to registering ("Create an account").

Measured on 10 Oct 2026: below 768px the header is one 86px line at every
width from 320px, for guests and members alike. Between 768px and 1023px the
three pills with their words take a second line (136px). Nothing scrolls
sideways at any width.

768 and not 640 because 640 was measured: with the words back on, a 640px window
still scrolled sideways by 61px.

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

**They are drawn in this frame**, the same sidebar, header and scene as every
product screen. Tyler, 10 Oct 2026: a written page "should be wired to the
_pomodoro layout". The shell serves written pages from its catch-all route,
and Pomoder answers first through `pages.catchAll` in `src/app/options.ts`:
`loadWrittenPageForPomoder` (`src/lib/pomodoro/written-page.ts`) reads the
page with the shell's own `loadWrittenPage`, so a page switched off is still
not-found and a members-only one still asks for sign-in, and any address
nobody wrote answers null and gets the shell's not-found.
`written-page-frame.tsx` draws the page's rows (the shell's `FrontPageRows`)
inside `PomodoroShell`, and is loaded only when such a page opens. The page's
title, robots and social tags are the ones the shell gives it; the canonical
link is not, because an app's catch-all head carries meta tags only.

**They are not in the left menu.** Tyler, 10 Oct 2026: "adding a page in
public menu should not add them to the sidebar". The left menu is the
product's own screens and Settings, nothing from Settings → Public →
Navigation.

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
