# Following, cheering and finding people

The social half of the public profile. A follow needs no invite and nobody's
permission, which is the whole difference from a
[focus group](focus-groups.md).

## Following

A Follow button on a profile, and a Following tab on the leaderboard.

- **One way, and nothing to accept.** There is no follow request, no private
  account and no notification when somebody follows you.
- **200 at most.** Tyler's call, 2 Oct 2026, for the same reason groups are
  capped at five and fifty: an uncapped list is a list one account can use to
  follow every member.
- **A double press is one follow.** A unique index on the pair decides it, the
  way the achievements index decides a twice-earned badge, rather than a
  read-then-write two tabs could both pass.
- **You cannot follow yourself**, and the database carries that rule too.
- **Following somebody who publishes no figures is allowed.** Tyler's call,
  2 Oct 2026: following is about the person, not the board. Their row shows
  their name with no numbers rather than looking broken.
- **A profile that is not switched on cannot be followed**, because there
  would be nothing to see.

**The button says what pressing it does** (`profile-actions.tsx`):

- **While it is still asking** whether you follow, it shows a grey
  "Checking…" with a spinner and cannot be pressed. It used to show an orange
  Follow for a moment to people who already followed, which invites the wrong
  press.
- **Not following:** Follow. A screen reader hears "Follow Sam".
- **Following:** the button reads Following, and turns into Unfollow on hover
  and on keyboard focus. A screen reader hears "Unfollow Sam".
- **Unfollowing is still one press**, and a toast confirms it: "You unfollowed
  Sam."

"No such profile" and "you may not follow this one" give the same sentence on
purpose. A different message for each would be a way to find out you had been
blocked.

### The Following tab is the same board

It filters `readLeaderboardRows`, the one ranking query, rather than running
one of its own. Two boards with two queries would one day disagree about a
figure. Somebody following nobody gets a line explaining the tab rather than
an empty list.

## What the people you follow did

A short card on the leaderboard screen: the last ten badges earned by the
people you follow.

- **One query for the whole list**, held for a few minutes. This is the
  easiest place in the app to write a query that runs once per followed
  account on every page load, and it does not.
- **Following nobody costs no query at all.**
- **It only shows what their own profile publishes.** The feed reads each
  person's badges switch, so it can never show something their profile hides.
- A new follow drops the held copy, so somebody you just followed appears on
  the next load rather than in three minutes.

## Streaks in the bell

When somebody you follow reaches a 7, 30, 100 or 365-day streak, you hear about
it in the bell, with a link to their page so a cheer is one click away. Only
somebody whose page opens and has "Hours and streaks" switched on is announced,
and nobody gets more than five of these a week. This is not the "followed you"
notice ruled out above: it is about their streak. See
[Notifications](notifications.md).

## Rooms in the bell

When somebody you follow opens a public room, you hear about it in the bell, at
most three a day, and the notice goes away if the room closes before you read
it. This is not the "followed you" notice ruled out above: it is about their
room. See [Notifications](notifications.md).

## Cheering

A short line sent to somebody you follow, chosen from five.

- **The picker is a button, not a setting.** It always reads "Send a cheer",
  so the same line can be sent twice in a row. While one is on its way it
  reads "Sending…" and cannot be opened, so a fast second pick never sends
  twice.

- **Nothing is typed.** That is the design, not a limitation: a canned line
  has nothing to moderate, cannot carry a link or an insult, and is the reason
  this needs no report queue of its own.
- **Three a day per pair.** Enough to be encouraging, far too few to be a way
  to pester somebody. The cap is per pair, so following many people is never
  limited by how much you cheered one of them.
- **It arrives as a notification** in the bell beside your photo, under the
  Social tab. Clicking it opens the sender's public page while that page opens
  for you. See [Notifications](notifications.md).
- **It can be switched off** on Settings → Public page, and off means no
  notification at all.

Only one of the three ways a cheer can fail is visible to the sender. The
daily cap says so plainly, because it is the sender's own doing. Being blocked
and the recipient having cheers switched off both report success and deliver
nothing: a sender who could tell those apart would have a way to detect a
block.

## Finding a profile

Four ways, and the cheapest one first.

### Names on the boards are links

A display name on the leaderboard, a group board, a room's member list or a
line of room chat links to that person's profile.

- The handle rides on the row the board already reads, selected beside the
  name. There is no lookup per row, which would turn a hundred-row board into
  a hundred and one queries.
- A name only becomes a link when the profile actually reads. A switched-off
  or hidden profile sends no handle, and the name draws as plain text exactly
  as every name did before profiles existed, so no row ever links to a 404.
- Initials stay on the boards. A picture belongs to the profile page.

### A card for link previews

`/badge/profile/<handle>.png` draws the person's name, their hours this month
and their current streak, and the profile page points its Open Graph and
Twitter tags at it.

- **PNG, not SVG.** Tyler's call, 2 Oct 2026: X, Slack, iMessage, WhatsApp and
  Discord all refuse SVG in a link preview, so an SVG card would show nothing
  in every place this is aimed at. It is drawn as SVG and rasterised with
  sharp, which is already a dependency.
- It carries only what the profile publishes. With the figures switched off it
  draws zeros rather than leaking them.
- It sits beside the streak badge rather than under `/u/`, because
  `/u/$handle/$year` already claims every second segment there and matched
  `card.png` as a year.
- Held five minutes, the same window the response says it may be cached for,
  so a link pasted into a busy channel is one read rather than one per reader.
- Every value a person typed goes through the streak badge's own `escapeXml`.
  The picture is served from our address, so an unescaped `<` in a display
  name would put markup on a page we serve.
- Fonts are generic families only. The rasteriser has no network and no web
  fonts, so a named font would silently fall back and move every number.

### The /users directory

A page listing the members who asked to be listed, reached from **Users** in
the sidebar, beside Leaderboard. Both are about other members, which is why
they sit together.

- **A second switch**, separate from having a profile at all. Having a page
  and being in a directory other people browse are different wishes, which is
  the same reasoning that keeps a group board and the global board apart.
- **Drawn to Tyler's design of 8 Oct 2026** ("redesign the users listing
  page"). A search box and the tabs (Most focused, Newest, Online now) sit
  on the title's right.
  Each person is a card in a grid of three: photo, name, handle and Follow
  along the top, the bio, then a line and the hours focused beside View
  profile. Your own card says YOU and has no Follow.
- **Most focused is the default order; Newest is the other.** This replaces
  the 2 Oct rule of newest only ("ranking it would make a second
  leaderboard"), because the 8 Oct design puts Most focused first and
  selected. Somebody who keeps their figures private counts as nought, so
  they sort to the end rather than disappearing, and their card shows no
  hours. Equal hours fall back to newest first.
- **Online now is a third tab.** Tyler, 8 Oct 2026: "Add another filter for
  'Online now'". It is Most focused narrowed to the people in the middle of a
  focus who switched on "Focusing right now" on their profile, the same test
  the profile's Focusing now line uses: a running session whose own clock has
  not run out. The app keeps no other record of who is online, and showing
  presence without that switch would publish it for people who never chose
  to. Held for 30 seconds rather than five minutes, because it changes by the
  minute. Nobody focusing says so, and says which switch puts you there.
- **The search looks at names and handles**, as a plain piece of text: a typed
  `%` or `_` is that character, not a wildcard. It writes itself into the
  address (`/users?q=jon`) a moment after the last key, so a search is a
  link, and it always starts again on page one. Nothing found says "Nobody
  listed matches …".
- **Follow on a card is the profile's Follow**: Follow, then Following, which
  reads Unfollow under the pointer or keyboard focus, with the same toast on
  unfollowing. The server says on each card whether you already follow that
  person, so the button starts in the right state with no read per card. A
  signed-out visitor's Follow opens the login page and comes back to
  `/users`.
- **Only listed profiles reach the sitemap.** A profile switched on but not
  listed is reachable by its address and absent from both `/users` and
  `/sitemap.xml`. Somebody who wanted a page to point at from their own bio
  did not thereby ask to be indexed.
- Held five minutes and paged, so no visitor causes a per-row read. Saving the
  Settings card drops the held pages, so a listing switched on appears on the
  next load.
- `/users` is its own address and does not redirect to `/users?page=0`.
  Most focused and an empty search are left off the address too;
  `?sort=newest`, `?sort=online` and `?q=` are there only when chosen.
  Previous and Next keep them.
- Held per order, search and page. The order, the search limit (40
  characters) and the labels are in `src/lib/pomodoro/user-directory.ts`;
  the query is `readUsersPage` in `src/server/pomodoro/public-profile.ts`,
  tested in `users-directory.test.ts`.
- **Previous stops on the first page and Next on the last.** At either end the
  button is a real disabled button, so a press does nothing and Tab skips it.
  They used to be links drawn grey, and a link cannot be switched off, so Next
  on the last page still opened an empty one (`PagerButton` in
  `users-page.tsx`).
- **A page past the end says so.** `/users?page=999` says "There is nothing on
  page 201. The list has 3 pages." with Back to page 1. The address is capped
  at page 200 before it reaches the server. It used to say "Nobody is listed
  yet", which was untrue with people on page 1.
