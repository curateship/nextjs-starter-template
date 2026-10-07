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

Up to three badges sit larger above the rest, and the others stay in the row
beneath. A pinned badge the account has not earned, and a pinned id that is no
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
Your public page card below it shows the same one. The header's account menu
draws it too. Everywhere else still shows initials. The leaderboard and room
chat are unchanged.

## The banner

A strip behind the name: one of the eight scenes from
[Backgrounds](backgrounds.md), or one of your own pictures. None is the
default and the page looks finished without one.

The eight scenes are free and your own picture is a Pro perk, which is how
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

## An unlisted room is not listed

The room section reads the room's own `visibility` and honours it. Unlisted
means not listed, and a profile is a listing. A closed room and a booked one
that has not opened both stay off the page too.

"Closed" means either half: `closed_at` set, or the phase being `closed`.
Everywhere else in this app checks both, and the public rooms list keys on
`closed_at` rather than the phase, so a profile that trusted only the phase
could put a Join button on a room that refuses the join.

## Where it is edited

Settings → Public page, in a card called "Your public page". It has its own tab
rather than sharing one with the display name: the display name is what other
members see on the leaderboard and in rooms whether anything is published or
not, and everything on this card is about one page on the open internet. A card
mixing the two cannot be read at a glance.

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
