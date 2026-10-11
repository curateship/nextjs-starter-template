# Made-up members

Pomoder can fill itself with made-up member accounts that focus every day, so
a visitor finds people on /users, names on the leaderboard and hours on the
front page. They are ordinary accounts in every table a member's screen reads,
so they show everywhere a real member shows. Only the admin can tell them
apart.

Tyler asked for this on 9 Oct 2026: "I need to create a task that auto
populate the app with users so that the app appears more busy", and then "We
just need real accounts that mimic live activities." The five task files are
in `workspace/tasks/live-activity/`: the accounts and their days (01), rooms
(02), chat (03), how they touch real members (04) and the admin's controls
(05). This page covers all five.

## Tyler's rules

His decisions, 9 Oct 2026. They outrank the code.

- **Forty to start**, each focusing two to four hours a day. The same day his
  "at least 10 rooms open at all times" raised the default to a hundred, and
  stayed at a hundred when he made the ten a suggestion.
- **The busiest never over three hours a day**, so a real member can reach the
  top of the leaderboard.
- **Timezones spread across the world**, so somebody is always "Online now".
- **Two to three months of history when they are made, never more.** Tyler, 9
  Oct 2026: "Since its a new app, we don't want there to be stats dating back
  too far. Make it date back about 2-3 months". This replaced his first
  decision the same day, ninety days with a full year for a dozen.
- **Nobody can sign in as one and no email ever goes to one.**
- **The admin lists mark them** so Tyler can tell them apart. **Real members
  never see any mark.**
- No line about them on the Terms page (declined, 9 Oct 2026).

## The tab

Settings → App settings → Made-up members, at
`/admin/settings/pomodoro-made-up-members`. Like every Pomoder settings tab it
saves itself with no Save button ([Admin settings](admin-settings.md)).

- **The count line** says "6 made, 2 focusing now". While a batch is being
  made it says "32 of 40 made" and reads the count again every 3 seconds.
- **How many** (0 to 200, 130 to start) is how many there should be.
  Lowering it never removes anybody; it only stops new ones. It was 100 until
  Tyler's "Add 30 more made up profiles" on 10 Oct 2026 (see "Rooms").
- **Hours a day** (1 to 6 in quarter hours, 3 to start) is the most any of
  them focuses in one day. No account ever plans more, and the worker shortens
  or skips a session that would take today past it, even on a day the number
  was lowered half way through. The fade lowers it on its own (see "Your
  controls"), which is why it moves in quarter hours.
- **Pause everything** stops the worker starting new sessions and stops new
  faces arriving. Sessions already running finish. Make them now still works.
  It outranks the five switches under it (see "Your controls").
- **Make them now** queues the work and answers at once. The worker makes up
  to ten accounts every 15 seconds until the count is met, so forty take
  about a minute and a half-made batch is harmless. Measured locally on 9 Oct
  2026: six accounts in 6 to 12 seconds. With the count
  already met it says so and makes nothing.
- **Remove all** asks first ("Removes 40 made-up accounts and everything they
  did. Real members are untouched.") and then deletes every account named in
  `pomodoro_simulated_accounts`, with everything they own. It never picks
  accounts by email address. It also cancels a Make them now still going.
- **Every press is in the audit log**, resource `simulated`:
  `simulated_make`, `simulated_remove` (with every id removed) and
  `simulated_pause`. How many and Hours a day write `setting_simulated.accounts`
  like any setting.
- **Nothing is ever made by itself before the first Make them now.** A fresh
  database or a deploy makes no accounts.

## What a made-up account is

- **A row in `pomodoro_simulated_accounts`** (migration 0129) is the only thing
  that says an account is made up. `users` is a shell table and has no column
  for it. The row holds the habit (below), a one-line personality for the room
  chat in task 03, and `claimed_at` for the worker.
- **A shell account with no password.** Nothing typed can match a missing
  password, so sign-in always fails. The email is
  `<handle>@simulated.pomoder.com`. The address counts as confirmed, which is
  what stops the shell's "confirm your address" reminder.
- **Written by Pomoder itself, not by the shell's "add a person".** The shell's
  `createAccountByAdmin` emails a set-your-password link when there is no
  password, and the shell's delete emails an "account closed" receipt. So
  `src/server/pomodoro/simulated-accounts.ts` writes the account row itself and
  Remove all deletes the rows itself, the same delete the shell's purge runs.
  No password link is made and nothing is queued to send.
- **A public profile with every switch on**: public, listed on /users, on the
  leaderboard, figures, badges, year grid, projects, "Focusing now", room, and
  the task shared in rooms. Cheers are on.
- **A name, handle and bio that fit one place.** Nineteen cities from Lisbon to
  Auckland, each with its own first names, surnames and side projects, in
  `src/lib/pomodoro/simulated-people.ts`. A new account goes to whichever city
  has fewest so far, so forty land two or three to a city. The display name is
  the full name, the first name and an initial, or the first name alone. No two
  accounts share a name, and a handle that is taken or reserved tries another
  shape and then gets digits.
- **Coloured initials, no photo.** The shell only lets an account use a
  picture it uploaded itself.
- **A banner** from the free Live backgrounds, and **up to three pinned badges** from
  the ones its history earned.
- **Three to five projects**, two of them public, from the person's work and
  their city ("Moot court", "Client memo", "Surf trip plan"), so the profile's
  "This week's work" has something to show and the admin Projects page lists
  them.

The names, bios and projects come from the bundled list. The task file also
asks for names and bios written by the AI when the key from task 03 is set;
task 03 is not built, so that branch does not exist yet.

## The working day

A habit is a small piece of JSON per account: timezone, start hour (between
7am and 1pm local), hours a day (2 to 4), days off (most take the weekend and
some a weekday as well), the range a session is drawn from (such as 20 to 55
minutes) and the range a break is drawn from (such as 5 to 20).

`planSimulatedDay` in `src/lib/pomodoro/simulated-days.ts` turns a habit and a
date into that day's sessions and tasks. A day is worked out, never stored: the
same account and date always give the same day. That is why the history
written when an account is made and the worker that runs today follow the same
rules, and why a worker that restarts mid-day carries on where it was.

- **Every session is drawn fresh** from the habit's range, and the gaps too,
  with a lunch break most days. Two days never look the same and nobody runs
  25-minute sessions back to back.
- **A day lands near its hours.** A three-hour habit gives between 2.5 and 3
  hours under a cap of three. The last stretch is folded into the last session
  rather than left as a ten-minute stub.
- **One to three tasks a day** from the person's own titles ("Draft the Q3
  deck", "Reply to Ana's notes"). Each task takes a run of the day's sessions;
  most are ticked after their last session and now and then one is left over.
- **Lives change.** Each month the start moves by up to two hours either way
  and the hours move a little, inside the cap. One month in eight has a week
  off. One account in twenty goes quiet for a whole month. About one working
  day in fourteen is skipped for no stated reason. Over three months at most
  half the accounts keep an unbroken streak.
- **Every city works in its own daytime.** A Tokyo account focuses in Tokyo's
  morning and afternoon.

## The worker

`pomodoro-simulated-days` in `src/app/server-options.ts`, ticked every 15
seconds with the app's other workers.

- **Once a minute** it claims every made-up account with `FOR UPDATE SKIP
  LOCKED` and a five-minute `claimed_at` timeout, so two server copies never
  look after one account at once. For each one it finishes any session whose
  time is up through the timer's own `completeProductivitySession`, ticks the
  task when the day says so, and checks badges with `awardAchievements`, the
  same calls a real member's finished focus makes. Then, unless paused, it
  starts the session the day says is due through `startProductivitySession`.
  Each planned session has its own key (`simulated:<date>:<n>`), so it can
  only ever be started once.
- **Every tick, while Make them now is going**, it makes up to ten accounts.
  Making and Remove all share one database lock, so Remove all can never race
  a half-made batch.
- **While the count is under How many and no batch is going**, a new face
  arrives three to five days after the newest one, so one or two a week. A new
  face joins today with no history, so it tops the Newest tab on /users.
  An account from Make them now joins one to seven days before its history
  starts, so "member since" agrees with its year grid.

## The history

When Make them now makes an account it writes every day before today, using
the same day plan: completed sessions, the day's tasks (ticked or left over),
and the day rows that the leaderboard, the year grid, streaks and History
read. Days off stay empty, so the year grid has gaps. Each account's history
goes back a number of days drawn between 60 and 90 (`HISTORY_MIN_DAYS` and
`HISTORY_MAX_DAYS`), so no account looks older than the app.

Badges are written straight into `pomodoro_achievements`, dated the day the
running totals crossed each badge's line, never today, and with no bell
notice.

## Rooms

Task 02, built 9 Oct 2026. Tyler's reason: rooms with nobody in them are worse
than no rooms. Some made-up accounts host public rooms during their working
hours and others sit in them, so Open to join on `/` and `/rooms` has cards,
Upcoming has bookings, and the front page's "rooms running" row shows. The
worker is `pomodoro-simulated-rooms` (`src/server/pomodoro/simulated-rooms.ts`,
the rules in `src/lib/pomodoro/simulated-rooms.ts`): starting rooms every
tick, everything else once a minute. Every step goes through the buttons a
person presses: open, start, join, leave, close, a weekly rule.

**Tyler's rules for rooms, 9 Oct 2026, in his words:**

- "there needs to be a few rooms open at all times"
- "if one enters a room. it should take about 10 seconds to start. Also the
  host should say something before he starts"
- "why would host starts slientely if nobody real is in there?"
- "we need at least 10 rooms open at all times" with "Show 6 with a load
  more to show at least 10", then "10 room is just a suggestion. it doesnt
  hav eto be 10 rooms. It can be whatever make sense"
- "Shuffle a few starting in... from 1 to 5 minutes", "At least 3 starting
  in..." and "Only 3 starting in.. shows"

**And the rule that outranks the rest: a room with a real person in it is
never closed by the worker.** When the host's focuses are done and a real
member is still there, the host runs four more.

### Six rooms on Open to join, three under Starting soon

Open to join hides a room mid-focus, so "open" means rooms waiting or on a
break. The worker keeps at least six listed besides the ones counting down,
and three counting down under Starting soon. Six is the first page of Open to
join before Load more, so the first screen is always full: three starting
soon, then six to join.

- **Made-up rooms wait between rounds.** They are opened with auto-start off,
  so every break ends in "waiting to start", which is listed.
- **While fewer than three rooms count down, a waiting host with company
  presses Start at once** with a countdown of 8 to 15 minutes, and the room
  shows under Starting soon until it ends. It needs no six others for that,
  because a room counting down stays listed. Tyler, 10 Oct 2026: "the
  starting in... always have 3+ rooms"; asking for six others had left
  Starting soon short a tenth of the day.
- **Any other Start, by a host with nobody real in its room, waits for six
  other rooms to stay listed**, counting none that are already counting down.
- **Why 8 to 15 minutes and not the 1 to 5 Tyler first said.** Three rooms
  counting down 3 minutes each need a new start every minute, and each start
  takes a room off the list for half an hour or more of focus. A hundred
  members cannot feed that. Measured over a simulated day, checked every
  minute: 1 to 5 minutes kept three counting 16 checks in 100 and none 29 in
  100; 8 to 15 minutes kept three 90 in 100, at least two 99 in 100, and never
  none. Keeping a fourth spare did not help. A real host still picks 1 to 5
  minutes.
- **Otherwise a host starts only when three more rooms than that stay
  listed**, nine, so the next countdowns have rooms to come from, and after
  its own short wait: five to seven minutes before the first focus, one to
  four between rounds. Its countdown is then 5 seconds. Otherwise it keeps
  waiting, and the room stays on the list.
- **A host closes only the same way**: its focuses done, or its local night
  come (11pm), and six other rooms still listed. From 1am to 6am it closes
  anyway, because hosts in other cities are awake.
- **More rooms open while there are too few.** While fewer than nine rooms
  are listed (six plus three to count down), or fewer than sixteen made-up
  rooms are open, hosts between 7am and 10pm locally open more, as many as it
  takes in one pass, each no sooner than 20 minutes after its own last room
  closed. Real rooms count toward the nine.
- **Hosts follow the background catalogue.** Tyler, 9 Oct 2026: "the rooms is not
  taking on the new themes I added". Every pass (`keepScenesLive`): a host on
  a background or sound no longer Live gets the Live one fewest hosts have; while
  one Live background has two more hosts than another, a host moves across, so a
  new background is spread over the hosts within a minute; an open made-up room
  takes its host's new pair at once when its background was removed, and otherwise
  only while nobody real is in it; a weekly booking takes it too.
- **Half the accounts host**, and a host is picked to join somebody else's
  room only when nobody else is free, so hosts stay free to open rooms.
- **It needs a hundred accounts.** Measured over a simulated day, back when
  the floor was ten rooms: 40 fell under ten a third of the time, 80 never did
  but now and then left a room with only its host for over ten minutes, 100
  did neither. "How many" starts at 100 for that reason.
- **A countdown waits for company.** A room starts its long countdown only
  once somebody besides its host is in, because a Starting soon card with one
  face looks dead.
- **People hop rooms in the quiet hours.** When a room has only its host and
  nobody awake is free, somebody from a room with two or more made-up members
  to spare, nobody real in it and not mid-focus says goodbye there and moves
  over (`moveSomebodyIn`).
- **Tested**: 130 accounts in their own cities over a whole simulated day,
  checked every two minutes, keep six or more rooms on Open to join at every
  check, Starting soon at three or more in over 95 checks in 100, and no
  listed room with only its host for more than ten minutes
  (`simulated-rooms.test.ts`). Measured on 10 Oct 2026: 100 accounts with
  the old rule, three or more 88 checks in 100; 130 accounts, 90; 130 with
  the new rule, 99 (680 of 690). Keeping a fourth spare, starting the next
  countdown two minutes early and keeping twenty rooms open each changed
  nothing.

### When somebody real joins

- **A countdown already running is obeyed**: joining never cuts it short.
- **With no countdown, the host presses Start about 10 seconds after they
  come in**, or 10 seconds after the break ends if they were already there,
  and the room then counts down. The join itself sets a 10-second timer
  (`joinRoomFn` in `src/lib/api/pomodoro/rooms.ts`), and the worker's
  15-second pass covers a server restart.
- **The host says a line before the focus**: a hello to the newcomer, then a
  line about starting, said during the countdown right after Start is
  pressed, so a slow AI line never holds the start up. See "Chat and the
  voice card".
- **The worker never closes a room somebody real has just joined.** It looks
  for real people again, holding the same room lock a join takes, at the
  moment it closes.
- **Nobody real is ever kept waiting** for a host who has run its focuses; it
  plans four more.

### The rest

- **Hosts are picked to spread round the clock.** Each host's rhythm, room name and
  background and sound pair are saved on its habit. Rhythms come from 25 · 5 · 15,
  30 · 5 · 20, 45 · 10 · 20, 50 · 10 · 30, 90 · 20 · 30 and the house presets,
  each new host taking the one fewest hosts have. No two hosts share a background
  and sound pair, and none shares a background while the catalogue has an unused
  one. The pair can be any Live item, Pro ones included, because hosting is a
  Pro thing anyway. Names come from a bundled list ("Night shift, rain",
  "Morning pages", "Rainy Lisbon study").
- **A host also opens its room when its working day starts**, once a day.
- **Most rooms plan four focuses.** One in five plans six or eight, one in ten
  one, and a 90-minute rhythm two at most.
- **One to three other made-up members sit in each room**, mostly two, the
  emptiest rooms filled first. The first arrives
  one to four minutes after it opens and the rest one to eight minutes apart,
  only while the room is waiting or on a break, and only people at work or
  about to start by their own day (anybody free between 7am and 11pm when
  nobody is). Nobody who hosts an open room of their own is picked, because
  joining a room closes the one you host. Somebody who left may come back
  after an hour. Each stays one to four focuses, and one in three leaves after
  two. A seat that empties is filled at most twice more. Nobody is ever in two
  rooms.
- **In a room, a made-up member's timer runs with the room's focus**, so
  "Focusing now" and the task beside its name read true. The hours cap still
  holds: one past its three hours sits in the room without a timer.
- **The featured slot.** When no room with a real host is featured, the
  made-up room with the most people in it takes the slot, and lets go as soon
  as an admin features a real room. A made-up room an admin featured is left
  alone. If an admin takes the worker's feature off a room, that room is never
  featured again.
- **Weekly rooms.** Three hosts keep a weekly booked room on one of their
  working days at the hour they start, which shows under Upcoming and opens on
  time through the existing booked-room worker. The room opens waiting and the
  worker brings its host in.
- **Why the weekly hosts have no Pro plan.** The task offered two ways past
  the booking worker's Pro check: a manual Pro plan through the shell's
  `grantManualPlan`, or teaching the check about made-up accounts. The manual
  plan emails the account and counts it as a paying member on the admin's
  billing pages, so `mayHost` in `scheduled-rooms.ts` lets a made-up account
  through instead.
- **Pause everything**, and the admin's "Pause new rooms" switch, stop new
  rooms, new arrivals and new weekly rules. Rooms already open run on and
  close as planned.
- **Remove all and rooms.** A host whose room has a real person in it is not
  deleted at once: it is marked, starts nothing new, and goes with its room as
  soon as no real person is left in it. The card says how many are waiting.
  Everybody else goes at once.

## Chat and the voice card

Task 03, built 9 Oct 2026. Tyler, 9 Oct 2026: "There should be options to
adjust how the ai sounds too so it doesnt sound like ai." The made-up members
speak in the rooms they host or sit in: a short line when a room opens, as a
break starts or ends, when somebody real joins, a reply to a real line, an
answer when someone @names them, one exchange between two of them at a break,
a goodbye before leaving early, and the odd emoji reaction. The worker is
`pomodoro-simulated-chat` (`src/server/pomodoro/simulated-chat.ts`), every
tick, one pass at a time across server copies.

**Nothing is said until the voice card's Preview has been pressed once**, and
nothing while Pause everything is on. Tyler's rule in the task: "Never let a
line go to a live room before Tyler has read a Preview." The first Preview
writes a `simulated.voicePreviewed` row, and the worker checks for it.

### When they speak

- **Never during a focus**, except to answer somebody who @named them, which
  they do 20 to 90 seconds later, once.
- **A reply to a real line** comes 20 to 90 seconds after it, or at the next
  break when it was written in a focus, from one of the made-up members in the
  room. While a reply is due, no other made-up line goes ahead of it.
- **The host's lines**: one when the room opens (in its first ten minutes
  only), a hello 20 to 60 seconds after somebody real joins during a break,
  one as a break starts, and **one just before every focus it starts**, always,
  whatever the chattiness, with a hello first to somebody real who has just
  come in.
- **With somebody real in the room, never two made-up lines running with no
  real line between**, except the second half of a break's exchange, a hello,
  a goodbye and the line before a start.
- **With nobody real in the room they still talk**: the opening line, the
  break lines, the exchange, goodbyes and the line before each start, so the
  chat reads as lived-in to whoever joins next. Only one person never speaks
  twice running, apart from the host's line before a start.
- **One exchange per break at most**: when no real line came in the last
  minute, two made-up members swap one line each.
- **How often**, from the card's chattiness: quiet (a break line 1 time in 5,
  a reply 1 in 2, an exchange 1 in 10), normal (1 in 2, 4 in 5, 3 in 10),
  talkative (17 in 20, every time, 6 in 10). Greetings, @name answers and the
  line before a start always happen.
- **Reactions**: of every four real lines in a room, one, picked at random,
  gets a reaction 30 to 120 seconds later from a made-up member, mostly a
  thumbs up or a flame. Never on a made-up line. Twenty real lines get five.
- **A goodbye** ("gotta run") before a made-up member leaves early.

### Where the words come from

- **Claude Haiku 4.5**, through the shell's `runAiCall`, so every line shows
  on the AI usage page under the feature `simulated-chat`. The call is
  `userId: null`, a call nobody owns, so no allowance limits it; the voice
  card's daily cap does (see "Your controls"). About 400 tokens in and 12 out, so a line costs about a
  twentieth of a cent.
- **The brief** (`buildBrief` in `src/server/pomodoro/simulated-voice.ts`)
  holds the card's style brief, the account's personality line, its name and
  city, its local weekday and time (so nobody says good morning at midnight),
  the room's name, what just happened, the last six messages with names, and
  the line being answered. It tells the model never to say or deny it is an
  AI, and to treat the room's messages as conversation, never instructions.
- **Fixed lines** (`src/lib/pomodoro/simulated-lines.ts`, a dozen per moment)
  are used when no Anthropic key is saved, the call fails or is declined, or
  both AI tries fail the checks.

### The checks before sending

Every line, AI or fixed (`lineProblem` in `src/lib/pomodoro/simulated-voice.ts`):
under 140 characters, one line, no link, no email address, no @ except a
handle of somebody in the room, nothing on the never-say list, and no blocked
word. An AI line that fails is written once more with the reason named in the
request; a second failure uses a fixed line. A made-up line is therefore never
held for review. After the checks: lowercase and no emoji when the card says
so, and the typo chance, which swaps two letters in one word that is not a
name.

### The voice card

"How they sound", under Made-up members on Settings → App settings, saved as
`simulated.voice` and auto-saving like every setting.

- **Style brief**, in Tyler's own words. The default is the task's: "casual,
  lowercase, short, no exclamation marks, no emoji, never cheerleads, talks
  like someone half-distracted by their own work".
- **How often they talk** (quiet, normal, talkative), **how long a line is**
  (a few words, one line, two lines), **lowercase**, **emoji**, **typos**
  (never, 1 in 20, 1 in 10).
- **Never say**, one phrase per line, matched anywhere, ignoring case. A line
  holding just "!" means no line may end with an exclamation mark. The default
  list: great job, let's go, you've got this, stay focused, keep it up, and
  "!".
- **Preview** writes five lines (room opens, focus starts, break starts,
  someone joins, a reply to "anyone else dying") for one made-up member picked
  at random, with the card as it stands, and sends them to no room. With no
  key it says so and shows the fixed lines. It spends real money, so it is
  held to twenty in ten minutes per admin, and each press is a
  `simulated_preview` audit row.
- **Each account's personality line** is edited on a "Voice" card in its member
  window, 160 characters at most, a `simulated_voice` audit row on save.

### Every line is traceable

`pomodoro_simulated_lines` (migration 0131) has one row per attempt: who,
which room, the message it became (empty when thrown away), the moment that
asked for it, AI or fixed, the model, the cost in fractions of a cent, the
brief sent, the text, and why it was refused. A moment is answered once,
because the worker skips a moment that already has a row. Rows older than 30
days are deleted once an hour. The watch page reads this table.

### Choices left to Tyler

- **The model.** Haiku 4.5, as the task asked. Claude Haiku 5.5 is newer and
  about a tenth of the price, but the shell's price list only knows Haiku 4.5,
  so the AI usage page would show it at no cost until the shell learns it.
- **Names.** A host says the real person's first name ("hey sam"), as in the
  task's own example. The open question asked whether that is wanted.

## Files to share

"Give them files to share" on the same tab (uploads-and-sharing task 05, part
9) takes Pixabay picture and film links, one per line, up to ten at a time.
Each becomes an import for the made-up member holding the fewest files, runs
through the member Pixabay importer, and is shared at once, credited to its
Pixabay author, so "Shared by members" never looks empty. Only Pixabay links
are taken, never a file from anywhere else, and nothing happens until an admin
presses Give them files. These files skip the daily limit and the first-share
check, because the admin is the one choosing them. Migration 0147 marks the
imports.

## Touching real members

Task 04, built 11 Oct 2026. The made-up members reach real ones in four ways:
they follow and cheer one another so no count reads zero, they follow and
cheer a real member who publishes a profile, they sit in a real host's public
room for a while, and any "no" a real member says holds for good.

**What Tyler accepted, 9 Oct 2026, as the task file records it:** follows and
cheers among themselves, follows and cheers to real members, and joining a
real host's room, "knowing it is the most deceptive item on the list". So a
real member will hear from accounts that do not exist. This section keeps it
to that: one or two follows, one cheer a week, at most two in a room, public
rooms only.

The worker is `pomodoro-simulated-social` (`src/server/pomodoro/simulated-social.ts`),
once a minute, one server copy at a time. Every step goes through the code a
member's own button runs: `followByHandle`, `sendCheer`, `joinRoomBySlug`,
`leaveRoom`.

### Among themselves

- **Each account follows five to twenty of the others, once.** Most follow
  five to nine. One account in ten is popular and five times as likely to be
  picked. Measured on 130 accounts, 11 Oct 2026: 89 have three to eight
  followers, and the ten most followed have 22 to 33.
- **A follow is a plain row and nobody is told**, the way following works for
  everybody. Each is dated some time after both accounts joined.
- **Picked once per account**, marked `followedAt` on its habit, so a follow
  an admin deletes is never put back. A new face picks on the next pass;
  nobody follows a new face back.
- **A handful of cheers a day.** About one account in twelve cheers somebody
  it follows on a given day, at a local time between 9am and 9pm, three times
  as likely somebody who focused each of the last three days. Through
  `sendCheer`, so the three a day per pair cap holds. The notice lands in a
  bell nobody reads.

### Following and cheering real members

A real member here is an active account with a public profile and a handle,
not hidden, and not made up.

- **One follow within 48 hours.** The worker notes when it first sees the
  profile public, and one made-up account follows between one and forty hours
  later.
- **A second a week later, only if they focused that week.** Never a third.
  The count is of follows ever sent (`follows_sent` in
  `pomodoro_simulated_reach`, migration 0154), so a follow an admin deleted or
  a block dropped is never sent again.
- **The follower is awake where it lives** (8am to 10pm) when one can be, and
  is never an account with a block either way.
- **One cheer a week on a streak of three days or more**, from a made-up
  account that follows them, "Nice streak." in the bell under Social. Nothing
  when their cheers are off.
- **Nothing new once the profile is off or hidden.** What was sent stays, as it
  would from a person.
- **Their own streak notices reach made-up followers too** (`tellFollowersOfStreak`).
  Those are bell rows nobody reads. Kept, because skipping them would need a
  change to the shared notice code.

### A real host's public room

- **One or two visitors**, drawn once per room. The first comes between the
  card's **Visit a real room after** soonest and latest (10 to 60 seconds to
  start) after the room opens, the second the same after the first, and only
  while the room is waiting or on a break; during a focus the visitor waits for
  the break. Tyler, 11 Oct 2026: "The join is a bit slow. I think it should be
  around 10sec to 1 min and something I can edit in settings". It was two to
  six minutes before.
- **On the second.** Opening a public room sets a timer for the first visit
  (`timeFirstVisit`, from the open-a-room endpoint), and the worker looks for
  due visits every 15 seconds as well, which covers a restart and the second
  visitor.
- **Who comes, in this order**: a made-up member free and at work by its own
  day right now; then one at work sitting in a made-up room with nobody real
  in it and not mid-focus, which says goodbye there and moves over, because a
  real host matters more than a made-up room; then one free and awake where it
  lives, 7am to 11pm. Nobody awake and free means nobody comes. Tyler, 11 Oct
  2026: "I tried opening a room but no simulated users join". On that Sunday
  afternoon every member at work was already in a made-up room and the rest
  had the day off, so the first rule alone found nobody.
- **Never more than two at once**, and never a third visitor after one leaves.
- **Public rooms only.** An unlisted room is somebody's private choice.
- **They say hi** as they walk in (the "arrive" moment; fixed lines or the
  AI, under the chat switch and cap), and the host hears in the bell and gets
  a pop-up, as for anybody.
- **Their timer runs with the room**, so the hours count like any member's.
- **Each stays one to three focuses** and leaves on a break or while the room
  waits, with a goodbye, never mid-focus.
- **Never two leave in the same minute, and the last one stays until three
  focuses have passed** since the first came, so the host is never left alone
  all at once. After three focuses the room is the host's again.

### No means no

- **A removal is remembered.** `removeRoomMember` writes the room, the host and
  the moment onto the made-up account's habit (`removedFrom`) in the same step.
  That account never joins that room or any later room by that host, and no
  other made-up member comes into the room it was removed from.
- **A ban holds the same way**, across every room by that host.
- **A block, either way, stops every follow, cheer and join.** A blocked
  account inside the blocker's room leaves on the next pass, even mid-focus,
  without a goodbye. `blockAccount` already drops the follow in the same step
  as the block.
- **In made-up rooms they never greet, answer, @reply or react** to a real
  member across a block.

### Choices left to Tyler

- **One follow in 48 hours and one cheer a week**: keep, more, or less?
- **Join a real room only while the host is alone, or also when real members
  are there?** Built: they join either way, up to two.

## Your controls

Task 05, built 11 Oct 2026. Tasks 01 to 04 make the app look busy; these make
sure Tyler is the one person not fooled by it. The code is
`src/server/pomodoro/simulated-controls.ts`; the watch page reads are in
`src/server/pomodoro/simulated-watch.ts`.

### The watch page

`/admin/pomodoro-simulated`. The task put "Made-up members" under Members in
the admin menu; the menu has no Members group, so on the local workspace it
sits under Profiles, beside Leaderboard and Achievements, since 11 Oct 2026.
The live site's menu needs the link added by hand after a deploy, like
Projects.

- **The line across the top**: how many focused today, made-up rooms open,
  lines said and what they cost against the chat cap (UTC day), how many are
  paused, when somebody real was last on the site, and any switch that is off.
  Read again every minute.
- **Today's schedule**: the next 24 hours by hour, in your own time. Who starts
  a focus in each hour by their own day, and which rooms open: a host's room at
  the start of its working day, and the weekly bookings. It only reads; nothing
  is written. Paused accounts are left out, and rooms opened to keep Open to
  join full depend on the moment, so they are not in it.
- **The accounts**: tabs Today (focused, talked or in a room today), Paused,
  All. Each row has the name, handle, local time, today's hours on its own
  calendar day, its room, lines today and their cost, a pause switch, and the
  cog that opens the member window. Ticked rows pause or unpause in one
  request; each change is a `simulated_pause_account` or
  `simulated_unpause_account` audit row.
- **A paused account** finishes the session it is in, leaves its room at the
  next break, and starts nothing new. A paused host closes its room at the next
  break, unless somebody real is in it: that rule outranks the pause.
- **Lines** at the foot: every line attempt newest first, with who, which
  room, the moment, AI or fixed, the cost, and why it was not sent. Clicking a
  line opens the brief the AI was sent, so a bad line is traced to the setting
  that made it.

### Real members stay on top

- **Keep real members above**, 8 hours a week to start. Once any real member on
  the global board passes it in the board's week (the last 7 days, UTC days, as
  the admin board counts), no made-up member's week is let past the top real
  member's, less a quarter of an hour. Every made-up session, its own or a room
  timer, is cut to fit, and one already at the line starts nothing.
- **Nothing is ever taken away.** A made-up account that was already above the
  real member when they passed the line stays above until those days leave the
  7-day window. The rule is read on every pass, not once a day, so it follows a
  real member's week as it grows.
- **The fade.** On the first pass after Monday 00:00 UTC, when real members
  together focused more than **Fade after** hours (100 to start) in the week
  before, Hours a day drops a quarter of an hour, never under one hour, once a
  week. The card says when it did and why. Raising the dial again is allowed; it
  fades again the next week if real hours are still over.
- **The leaderboard never hides them**: they are trimmed, never taken off.

### The chat cap

- **Chat cap, cents a day** on the voice card, 50 to start. The day runs
  midnight to midnight UTC. Over it, every line is a fixed one until midnight;
  checked line by line, so it holds to the cent.
- **Counted from `pomodoro_simulated_lines`**, which keeps each line's cost to
  the fraction of a cent. The AI usage page stores each call in whole cents, so
  a line costing a twentieth of a cent shows there as nothing and could never
  reach a cap. The usage page still lists the calls under `simulated-chat`.
- **Preview is not counted.** It is the admin's own deliberate spend and has
  its own limit.

### A report mutes

When somebody reports a made-up member's line in a room, that account is
paused in the same step as the report (`reportRoomMessage`). The report queue
says "Made-up account" under the line with a link to the watch page's Paused
tab. Reviewing the report does not unpause it; the watch page does.

### Real members only

A switch on `/admin/pomodoro-focus` and on the Leaderboard's Board tab,
remembered in this browser. On, every made-up member is left out of the rows,
the count, and the Focus page's totals line, which reads like "Real members
focused 14h in the last 7 days and 312h in all." On the leaderboard, the places become places among real
members.

- **The AI usage page and the shell's admin dashboard cards are shell pages**
  and are not changed. The made-up members' chat calls belong to no account,
  so they show there under the feature `simulated-chat`, never as a person.

### Somebody real on the site

- **Noted when a real member's timer polls or their room's live connection
  beats**, at most twice a minute per server copy, as one row in
  `pomodoro_settings` (`simulated.realSeen`). The task asked for a timestamp in
  memory; in production the workers run as a separate program and never see a
  poll, so it lives in the database.
- **Seen in the last two minutes**: a host opens its day's room up to half an
  hour early, and the chat talks one notch more (quiet like normal, normal like
  talkative).
- **Nobody real for an hour**: no new room opens, of either kind, and chat
  drops to a room's opening line. Sessions and hours are not touched, so the
  leaderboard and the front page figure stay steady. Rooms already open run on.
- **Before any real visit has ever been noted**, on a new database, neither
  applies, so a site nobody has signed into yet still has rooms.
- **A signed-out visitor is not counted.** Only a signed-in member's timer or
  room says somebody is here. See "What is left and what to watch".

### One switch per behaviour

Five switches on the Made-up members card, saved as `simulated.switches`:
Sessions, Rooms, Chat, Follows and cheers, Join real rooms. Off stops that
behaviour on the next pass and leaves the others alone. Pause everything still
outranks all five.

- **Chat off**: rooms keep running, silent.
- **Rooms off**: open rooms finish as planned, no room opens, no weekly rule is
  booked, nobody new sits in one.
- **Sessions off**: nobody starts a focus, on its own day or with a room.
- **Join real rooms off**: nobody walks into a real room; those inside leave on
  time.

### Kept out of search engines

`/sitemap.xml` never lists a made-up member's page, and its `/u/` page carries
`<meta name="robots" content="noindex">`. Nothing else on the page differs.
The share card at `/badge/profile/<handle>.png` still works, so a link a real
member pastes still unfurls. The sitemap is held by the shell, so a change
shows on its next build.

### A restart leaves no ghost

The day worker's first pass after it starts cancels any made-up session still
running whose end passed over an hour ago, the line past which the timer stops
calling a session live. One that ended within the hour is finished by the
normal pass through `completeProductivitySession`. Rooms need nothing extra:
the room clock reads `phase_ends_at` and `starting_at` from the database every
15 seconds, so a room carries on from where it was.

### Choices left to Tyler

- **Eight hours a week** as the line a real member must pass to be kept first:
  keep, higher or lower?
- **Fifty cents a day** for chat: keep?

## What the admin sees

- **"Made up" beside the name** on every Pomoder admin list that shows a
  member's name (Focus, Profiles, Leaderboard, Projects, Sessions, Rooms and
  the rest, through `MemberName` in `admin-member-name.tsx`) and in the member
  window's title. The list of made-up ids is read once per page and again
  after a minute.
- **The shell's own admin pages do not carry the mark**: the Users list, the
  admin dashboard's member counts and the AI usage page count them as members.
  Those are shell pages and are not changed. "Real members only" on the
  Focus and Leaderboard pages leaves them out (see "Your controls").

## What is left and what to watch

- **Somebody could type a made-up address into Forgot password.** The shell
  sends a reset or sign-in link to any active account, so a link would go to
  `<handle>@simulated.pomoder.com` and bounce. It takes a person guessing the
  address and passing the human check. Stopping it needs a shell option, and
  the shell is not changed without asking first.
- **/users is held for five minutes.** Remove all clears the held pages at
  once on the server it ran on. Accounts the worker makes in production show
  within five minutes, because the worker is a separate program.
- **A real member can block one of these accounts.** The block holds the way
  it does between people; see "Touching real members".
- **An hour with nobody signed in stops new rooms.** A signed-out visitor is
  not counted as somebody real, so at a quiet hour on pomoder.com the rooms on
  `/` and `/rooms` close one by one and none replace them until a member signs
  in. That is the task's rule as written; counting a signed-out visit too is
  Tyler's call.
