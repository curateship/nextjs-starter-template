# Made-up members

Pomoder can fill itself with made-up member accounts that focus every day, so
a visitor finds people on /users, names on the leaderboard and hours on the
front page. They are ordinary accounts in every table a member's screen reads,
so they show everywhere a real member shows. Only the admin can tell them
apart.

Tyler asked for this on 9 Oct 2026: "I need to create a task that auto
populate the app with users so that the app appears more busy", and then "We
just need real accounts that mimic live activities." Rooms, chat, follows and
the admin's controls over all of it are tasks 02 to 05 in
`workspace/tasks/live-activity/`; this page covers the accounts and their
working days.

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
- **How many** (0 to 200, 100 to start) is how many there should be.
  Lowering it never removes anybody; it only stops new ones. Ten rooms at all
  times needs a hundred (see "Rooms").
- **Hours a day** (1 to 6, 3 to start) is the most any of them focuses in one
  day. No account ever plans more, and the worker shortens or skips a session
  that would take today past it, even on a day the number was lowered half way
  through.
- **Pause everything** stops the worker starting new sessions and stops new
  faces arriving. Sessions already running finish. Make them now still works.
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
- **A banner** from the free Live themes, and **up to three pinned badges** from
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
- **A host with nobody real in its room presses Start only while six other
  rooms stay listed**, counting none that are already counting down.
- **While fewer than three rooms count down, a waiting host presses Start at
  once** with a countdown of 8 to 15 minutes, and the room shows under
  Starting soon until it ends.
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
- **Hosts follow the theme catalogue.** Tyler, 9 Oct 2026: "the rooms is not
  taking on the new themes I added". Every pass (`keepScenesLive`): a host on
  a theme or sound no longer Live gets the Live one fewest hosts have; while
  one Live theme has two more hosts than another, a host moves across, so a
  new theme is spread over the hosts within a minute; an open made-up room
  takes its host's new pair at once when its theme was removed, and otherwise
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
- **Tested**: a hundred accounts in their own cities over a whole simulated
  day, checked every two minutes, kept six or more rooms on Open to join at
  every check, Starting soon full (three) more than 80 checks in 100 and
  empty under 1 in 100, and no listed room with only its host for more than
  ten minutes (`simulated-rooms.test.ts`). Measured over eight such days:
  Starting soon empty at none to four checks of 690, which is when the list
  is down to six and no room may start without taking it under.

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
  scene and sound pair are saved on its habit. Rhythms come from 25 · 5 · 15,
  30 · 5 · 20, 45 · 10 · 20, 50 · 10 · 30, 90 · 20 · 30 and the house presets,
  each new host taking the one fewest hosts have. No two hosts share a scene
  and sound pair, and none shares a scene while the catalogue has an unused
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
- **What hosts do not do yet.** They never join a real member's room (task
  04).

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
  `userId: null`, a call nobody owns, so no allowance limits it; task 05 adds
  the daily cap. About 400 tokens in and 12 out, so a line costs about a
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
days are deleted once an hour. Task 05's watch page reads this table.

### Choices left to Tyler

- **The model.** Haiku 4.5, as the task asked. Claude Haiku 5.5 is newer and
  about a tenth of the price, but the shell's price list only knows Haiku 4.5,
  so the AI usage page would show it at no cost until the shell learns it.
- **Names.** A host says the real person's first name ("hey sam"), as in the
  task's own example. The open question asked whether that is wanted.

## What the admin sees

- **"Made up" beside the name** on every Pomoder admin list that shows a
  member's name (Focus, Profiles, Leaderboard, Projects, Sessions, Rooms and
  the rest, through `MemberName` in `admin-member-name.tsx`) and in the member
  window's title. The list of made-up ids is read once per page and again
  after a minute.
- **The shell's own admin pages do not carry the mark**: the Users list, the
  admin dashboard's member counts and the AI usage page count them as members.
  Task 05 adds a way to leave them out.

## What is left and what to watch

- **Somebody could type a made-up address into Forgot password.** The shell
  sends a reset or sign-in link to any active account, so a link would go to
  `<handle>@simulated.pomoder.com` and bounce. It takes a person guessing the
  address and passing the human check. Stopping it needs a shell option, and
  the shell is not changed without asking first.
- **/users is held for five minutes.** Remove all clears the held pages at
  once on the server it ran on. Accounts the worker makes in production show
  within five minutes, because the worker is a separate program.
- **A real member can block one of these accounts.** Nothing here needs to
  care; task 04 does.
