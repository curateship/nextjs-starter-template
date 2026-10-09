# The public profile

One page about one person, at `/u/<handle>`, off until they switch it on.

Somebody who has focused for 300 hours has nowhere to point at. They put
`focusapp.com/u/sarah` in their X bio, and a stranger who clicks it sees a
face, two lines, four links and a year of green squares.

Everything on the page is published because its owner pressed a switch. There
is no part of it that is on by default, and an account that has never opened
the card publishes nothing at all.

A profile can also be [found](following.md), [followed](following.md), and
[reported or blocked](reporting-and-blocking.md).

## The address

A handle is 3 to 30 characters: lowercase letters, digits, hyphens and
underscores, and nothing else. It is stored lowercase, because a handle is an
address and `/u/Sarah` and `/u/sarah` must not be two different pages. Typing
it in capitals still finds the page.

Five things answer 404, and they answer it identically:

- a handle nobody holds
- a profile whose switch is off
- an account that has been deleted
- an address that is not even handle-shaped
- a profile an operator hid, or one belonging to somebody you have blocked
  (or who has blocked you)

Nobody can tell from the response which of the four it was. That is the same
rule [the streak badge](streak-badge.md) follows, and it is why the shape is
checked in the route before the database is asked at all: a handle carrying a
NUL byte threw a 500 on the badge route until `isBadgeTokenShape` was added,
and `isHandleShape` is the same check for the same reason. The database
carries the same rule again as a CHECK constraint, because a hand-run UPDATE
has no app in front of it.

### Handles the app keeps

A list in `src/lib/pomodoro/public-profile.ts` reserves every address the app
serves or might serve: `admin`, `api`, `badge`, `login`, `settings`, `timer`,
`u` and about forty more. None of them could shadow a real page today, since
every profile lives under `/u/`. The list is there for the day a handle gets
printed somewhere flatter. `focusapp.com/sarah` reads better on a business
card, and the moment anybody moves it there, a member holding `login` is a
problem that cannot be undone.

## How the page looks

Drawn to Tyler's design of 7 Oct 2026
(`assets/pasted-image-1791400528949910000.png`), in
`src/components/pomodoro/public-profile-page.tsx`.

- **One header panel.** The round picture on the left, then the name in large
  type with `/u/<handle>` beside it, the bio, and the follower and following
  counts. The links sit top right as round buttons, and the owner gets Edit
  profile beside them, which opens Settings → Public page.
- **The four figures run along the header's foot**, split by thin lines:
  hours focused, sessions, current streak and best streak, with the unit in
  smaller grey type. Two across on a phone, four on a wide screen.
- **The last year** is its own panel, with a line under the grid: active days
  and total focus time. The design counts sessions there, but the profile
  never publishes a day's sessions, so it counts time.
- **The year buttons are links.** The design draws 2026 and 2025 as tabs over
  the grid. The grid only holds the last 365 days, so each year opens that
  year's [review](#year-in-review) instead of switching the grid.
- **Badges · N** is a panel of tiles, four across on a wide screen. Each tile
  has a coloured square with a short mark (1, 3d, 10, H), the badge's name
  and the day it was earned. Sessions are blue, streaks amber, hosting green,
  and the rest orange.
- **Panels not in the design stay**, drawn the same way: Focusing now, the
  room being hosted, and This week's work. Each shows only when its switch is
  on and it has something to say.

## The year grid

History drew the same grid until 7 Oct 2026, when Tyler's redesign left it
out. It now draws only here (`focus-heatmap.tsx`):

- **16px squares with the month names above.** A year is 53 columns, which
  fills the content column on a wide screen. The weekday names sit level with
  their rows. A short range draws a few columns at the same size rather than
  stretching them.

- **It opens on the newest weeks.** The grid scrolls sideways inside its card,
  and it starts at the right-hand end with today in view. At 390px wide it used
  to open on last year, with today off the right edge.
- **Every square tells you its day.** Pointing at one, tapping it, or reaching
  it with the arrow keys shows "Tue, Oct 6, 2026 · 1h 20m · 3 sessions"
  in the shared tooltip, and the square gets an outline. A tap anywhere else
  puts it away. The day used to live only in a mouse-hover title, which a phone
  never shows.
- **One tooltip, one tab stop.** The grid is a single stop for Tab. Up and down
  move a day, left and right move a week, and Home and End jump to the first
  and last day. A tooltip and a tab stop for each of 365 squares could not open
  on a tap and would bury the keyboard.
- **A screen reader hears a summary**, such as "Focus by day from ... to ...:
  41h over 120 days", and then each day as the arrows move. History also keeps
  its hidden table of every day.

## What the page can show

The bio, the links and the picture ride on the one switch that publishes the
page. Everything else has a switch of its own, and every one of them starts
off.

- **Hours and streaks** — hours focused, sessions finished, current streak,
  best streak, over the life of the account.
- **Badges you have earned** — the badges on record, each with the day it was
  earned. Locked badges and their progress stay private on
  [`/history`](achievements.md), because progress is a private figure.
- **A year of squares** — the last 365 days, the same grid History draws.
- **What you worked on** — the last seven days by project, and only the
  projects ticked public. See [Projects](projects.md).
- **Focusing right now** — a line while the person is mid-session.
- **The room you are hosting** — a public room, with a Join button.

Separate switches rather than one, for the same reason
[focus groups](focus-groups.md) are a separate opt-in from the global
leaderboard: publishing a name is not the same decision as publishing a year
of working days.

### The server decides, not the page

A section whose switch is off is never read. No query runs for it, nothing
about it reaches the browser, and there is nothing in the network tab for a
reader to find. The page draws what arrived and asks for nothing.

### What the switches are warned about

Two of the labels say more than the section's name, because two of these
publish more than people expect.

- The year of squares says precisely which days somebody worked and which
  they did not, including every day they were ill.
- "Focusing right now" is presence. It tells a reader when somebody is at
  their desk. It names nothing about the work: no task, no project, no note.

## Three pinned badges

Up to three badges lead the shelf, ahead of the rest. A pinned badge the account has not earned, and a pinned id that is no
longer a badge at all, are both ignored when the page is built rather than
drawn as a gap. A fourth pin is refused with a plain sentence.

## The picture

The page draws the account's own picture when there is one and the coloured
initials when there is not.

`src/components/pomodoro/initials-avatar.tsx` says there are no stock faces in
this app on purpose: the old app shipped four photos and handed everyone one
of them. That decision is narrowed here, not thrown away. A picture somebody
uploaded themselves is their choice rather than an assignment, and
`isOwnedImageUrl` is what stops anyone setting a stranger's upload as their
own face. Tyler's call, 2 Oct 2026.

The photo is picked on Settings → Profile, on the Your profile card, and the
How it looks card on Settings → Public page shows the same one. The header's account menu
draws it too. Everywhere else still shows initials. The leaderboard and room
chat are unchanged.

## The banner

A strip behind the name: one of the Live scenes from
[Backgrounds](backgrounds.md), or one of your own pictures. None is the
default and the page looks finished without one.

Every catalogue scene is free here, Pro or not, and your own picture is a Pro perk, which is how
every other own-upload in this app already works. Tyler's call, 2 Oct 2026.

What is stored is the scene's key or the upload's id, never an address
anybody typed, in exactly the spelling a chosen background already uses
(`scene:<key>` or `media:<uuid>`) and read back by the same parser. A banner
pointing at a deleted upload falls back to no banner.

## The bio and the links

The bio is up to 280 characters and is drawn as text, never as markup. React
escapes it, which is the reason there is no rich-text bio here and should not
be one.

Up to eight social accounts, each on one of the ten platforms the app has a
mark for. The platform list, the labels and the caps are the same ones the
site's own footer uses, so there is one definition of what a platform is. An
address that is not `http:` or `https:` is dropped, `javascript:` above all,
and it is dropped on the way out as well as on the way in, so a row edited by
hand cannot put a bad address on a page. Every link opens in a new tab with
`rel="noopener noreferrer"`.

## Year in review

`/u/<handle>/<year>` sums one year: hours, sessions, tasks ticked, best
streak, busiest month, and the badges earned that year. It rides on the hours
and streaks switch, because every number on it is one of those figures.

A year with under 20 hours on record says so in one line instead of printing a
page of near-zeros. Tyler's call, 2 Oct 2026, out of three options: a short
line, a page of near-zeros, or no page at all. It is the same thinking as
[hiding a quiet front-page row](public-live-figures.md) rather than rounding
the number up.

Years before 2025 have no page, matching the All time leaderboard's floor, and
a year that has not happened yet has no page either.

## The pictures are served at the size they are drawn

The banner and the picture both ask for a smaller copy through
`mediaImageSrcSet`, the same helper the brand logo uses. A banner can be a
multi-megabyte upload, and this page is built to be opened by strangers on
phones.

## No visitor causes a read

A public page must not query per visitor, the same rule
[the public front-page figures](public-live-figures.md) follow.

- The assembled page is held for 30 seconds and every visitor inside that
  window is served the held copy. Thirty rather than the badge's five minutes,
  because "Focusing now" has to be gone within a minute of a session ending
  and the held copy is the only thing in the way.
- A year that has already ended never changes again, so its recap is held for
  a day. The running year is held for 30 seconds like the profile.
- Saving the card drops every held copy for that handle, old handle and new
  one both. Switching the page off takes effect on the very next request
  rather than 30 seconds later.
- Every section that is on is read in one batch, so the whole page is one trip
  to the database rather than a ladder of them.

## What never leaves the server

A handle is the public name of an account, and the account's id stays on the
server. Nothing in the page's data carries one.

The one exception is not this app's doing: a picture's address is an R2
storage key, and the shell builds that key out of the uploading account's id.
The site's own logo and favicon already put the same id on every public page
in the app, so the profile adds no new kind of exposure, but it is worth
knowing that an avatar URL contains it.

## A session that was never stopped

"Focusing now" reads a session only while it is running and its own clock has
not run out. A focus left open overnight has its end time in the past, so it
reads as not focusing rather than claiming a fourteen-hour session.

**The line counts down while the page is open.** The page carries the
session's end time, not a number of minutes, and the browser counts the
minutes left against it, re-reading its own clock every five seconds. When the
time runs out the line goes, and it never shows a negative number. It used to
print the minutes from the load and stay there, so twenty minutes later it
still said 12. The end time rather than the minutes because the page is held
for 30 seconds: a count taken when the copy was made is already out of date for
the next visitor, and the end time is not. The line is drawn only in the
browser, since the minutes depend on the reader's clock (`FocusingNowCard` in
`public-profile-page.tsx`).

## An unlisted room is not listed

The room section reads the room's own `visibility` and honours it. Unlisted
means not listed, and a profile is a listing. A closed room and a booked one
that has not opened both stay off the page too.

"Closed" means either half: `closed_at` set, or the phase being `closed`.
Everywhere else in this app checks both, and the public rooms list keys on
`closed_at` rather than the phase, so a profile that trusted only the phase
could put a Join button on a room that refuses the join.

## Where it is edited

Settings → Public page. It has its own tab rather than sharing one with the
display name: the display name is what other members see on the leaderboard
and in rooms whether anything is published or not, and everything on this tab
is about one page on the open internet. A card mixing the two cannot be read at
a glance.

The tab is four cards of related settings, in this order, with one Save button
under the last. Tyler asked to "clean up the public page card by grouping
related settings into its own card", and chose one Save over one per card.

- **Address:** the handle, "Publish my page at that address", and the address
  with Copy and Open my page once it is saved.
- **How it looks:** About you, accounts elsewhere, your picture and the banner.
- **What it shows:** the section switches and pinned badges.
- **Being found:** List me on /users, and Let people cheer me on.

**Save public page sends all four cards at once**, exactly as the single card
did, so a bad handle still names itself on the press whichever card you were
in. Until the settings have loaded, one "Your public page" card holds the
loading line, or the error with Try again, so neither shows four times. An
operator's hide notice sits above the four cards.

**The address and Open my page follow what is saved, not what is typed.** Once
the saved row is published with a handle, the card shows the full address
(`https://<this site>/u/sarah`), a Copy address button and Open my page. Copy
says "Copied" for two seconds; if the browser refuses the clipboard, the
address is written out to copy by hand. While the switch or the handle on the
card differs from what is saved, the card says "Save to publish your page."
instead. The link used to follow the unsaved switch, so it opened a page that
was not live yet (`public-profile-settings-panel.tsx`, `PageAddress`).

## It draws in the app's own layout, not the shell's

The profile is a screen of this app, so it lives under `_pomodoro` and draws
inside `PomodoroShell`: the sidebar, the header and the scene behind it, the
same as `/history` and every other screen here. A signed-out visitor gets Log
in and Register in the header instead of the account menu, and nothing else
changes.

The group invite and room invite pages are the precedent. A page a stranger
lands on from a shared link is still this app's page, not one of the shell's
signed-out marketing pages, and all three sit under `_pomodoro` for that
reason.

This is not a style preference. The profile draws with the Pomoder tokens
`--p-accent` and `--p-fg-rgb`, and those only exist inside this shell. Built
inside the shell's `PublicPageFrame` instead, the heatmap's squares resolved
to `rgba(0, 0, 0, 0)` and the whole grid was invisible.

The content column is `max-w-3xl`, measured at 768px wide and matching
`/history` card for card. Inside `_pomodoro` the page sets its own column;
the public frame's one-edge rule is for the shell's public pages and does not
apply here.

## Two things to know about the files

- **The year page is `u.$handle_.$year.tsx`, with the underscore.** Without it
  the router treats the profile page as the year page's layout, and since the
  profile draws no outlet, a visit to a year address silently draws the
  profile instead, with no error anywhere. `rooms_.$slug.tsx` is the same
  move.
- **There is no `*.page.ts` descriptor.** No screen under `_pomodoro` has
  one. Those descriptors describe the shell's public pages, and their address
  is a literal string that feeds `/sitemap.xml`, the public menu and the
  Pages dashboard, so a route with a parameter in it could not have one
  anyway: declaring `/u/$handle` would publish `/u/$handle` as a sitemap URL.
