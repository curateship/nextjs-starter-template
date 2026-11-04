# Bans

A ban now leaves a lasting mark on the phone, SIM, proxy and browser profile
it happened on, and Promo keeps new accounts away from places an app has
flagged. One button cleans up after a ban, the Bans dashboard lists every
ban, and accounts in trouble slow down before they are lost. The task is
`workspace/tasks/Bans/01-ban-features.md`.

## Tyler's numbers (2 and 3 Nov 2026)

- **A phone is kept off an app after 2 bans of that app on it.** The first
  ban only warns.
- **2 bans of one app within 24 hours pause every account on that app.**
- **Instagram and TikTok warm up for 7 days.**
- **A shadowbanned account posts at half pace** until it reads clear.
- **Cleaning up after a ban is one button, never automatic,** so an appeal can
  come first.
- **The appeal reminder comes after 7 days** with no answer.
- **The weekly look opens the banned app once a week** and only reads the
  screen.
- **Retire reasons are banned, sold, given up and other.**
- **Throwaway first:** an important account follows only after a
  throwaway's post there stayed up 24 hours.
- **Slow restart:** half pace for 7 days after "Let it run again".
- **Neighbours go easy:** every account on the same phone, proxy or SIM goes
  at half pace for 2 days.
- **A banned proxy is refused for that app. A banned SIM only warns,**
  because a new SIM takes a trip to the shop.
- **At risk** counts shadowbanned, hidden reach, a "confirm it's you" or
  locked screen in the last 7 days, and a neighbour banned in the last 2
  days.
- **New ban wording stops the account and asks.**
- **An account's source** is made or bought, the seller and the price.
- **A suspended Reddit reading counts as a ban everywhere.**

"Half pace" means half of every hourly and daily limit in Settings →
Behaviour, never under one, and half as many automatic actions a day. It
never queues a post: nothing posts without a person pressing Post.

On screen the word "burned" is never used. A phone reads "Banned on:
Instagram twice".

## Which bans count

- **Suspended, restricted and a suspended Reddit reading count.** They mark
  the phone, the proxy and the SIM, and they count toward the brake.
- **Locked and "confirm it's you" screens are recorded but not counted.**
  They show on the Bans dashboard as "Recorded, not counted" and make the
  account At risk for 7 days once it runs again.
- **This is Tyler's open question.** The default holds until he answers;
  changing it is one list, `COUNTED_BAN_KINDS` in `src/lib/bans/options.ts`.
- **A ban that was let run again still counts,** because the app still saw it.
- **Accounts are counted, not bans.** One account let run again and banned
  again is still one account lost: it never makes a phone read "twice" or
  puts the brake on by itself.

## The ban record

- **One row per ban, written the first time an account is stopped.** A
  phone's ban screen, X's and LinkedIn's lock pages, Reddit's and Medium's
  own suspended pages in a browser, a suspended Reddit reading, and an
  unknown screen a person called a ban each write one.
- **The same stop never writes twice.** While an account's newest ban has not
  been let run again or cleaned up, a second report of the same screen
  changes nothing, so one screen never counts twice toward a phone or the
  brake.
- **Where it ran is copied at that moment:** the phone, the browser profile,
  the proxy (a Wi-Fi phone's or the profile's), the SIM's number and carrier,
  and the project. A later move, a new proxy or a new SIM never changes what
  the ban was on.
- **It also keeps** the screen's words, the account's age on its network,
  its posts, comments and replies in the 7 days before, and the picture.

## On the phone (parts 1 to 5)

- **Banned on.** The phone's window, on the Settings tab under "On it", and
  its row on the Phones dashboard say "Banned on: Instagram twice, TikTok
  once". Nothing shows when there are none. A wipe never clears it, because
  a wipe doesn't clear the app's mark.
- **A History line.** Each ban writes a Banned line in the phone's History.
- **Accounts card.** The phone's History tab starts with every account it
  has held: handle, app, from and to, and how it left (moved, banned or
  retired). Each opens the account's settings on the Accounts dashboard.
  Older phones start with the account on them now; older moves are only the
  free-text lines below. Promo never deletes an account, so "deleted" is
  never a way to leave.
- **Kept off an app.** After one counted ban of an app, the phone pickers say
  "banned on Instagram once" beside the phone and saving goes through. After
  two, the phone is refused for that app: "This phone lost two Instagram
  accounts. Use another phone for Instagram." It stays open to other apps.
  The server refuses it too, from every screen that sets where an account
  runs and from a move to a phone.
- **A banned proxy is refused.** A Wi-Fi phone or a browser profile whose
  proxy was in a counted ban of an app takes no new account of that app
  until it is on a different proxy. The words name the proxy and where to
  pick another.
- **A banned SIM warns.** A SIM phone whose number was in a counted ban of an
  app says "This SIM was used by a banned Instagram account" when it takes a
  new one, and saving still goes through. An empty SIM number never matches.
- **Finding usable phones.** The Phones dashboard's "Banned on" filter lives
  in the address as `?banned=instagram`, and the back button undoes it. The
  Map draws a ban mark on each slot with a ban, naming the apps on hover.
- **The proxy row.** The Proxies dashboard says "Banned on: Instagram" under
  a proxy that was in a counted ban.

## At a ban (parts 6 to 11)

- **Clean up** is in the account's settings window, on its ban card, and in
  the ban's window on the Bans dashboard. It asks once in the card, then
  retires the account as Banned, takes it off its phone or browser profile,
  closes its row on the phone as banned, and queues the phone's wipe. A
  browser profile's saved sign-in is forgotten instead, and the profile
  stays; when other accounts still sign in to that profile, nothing is
  forgotten, because forgetting clears every sign-in in it. An iPhone still needs the iCloud check first: the card says so and
  links to the phone, and nothing changes until it has been read signed out.
  A phone that still holds another app's account is cleaned up all the same,
  and its wipe waits, with the reason.
- **Every browser catches its own ban page.** Reddit and Medium in a browser
  now read the page for the account's own suspended or locked lines, the
  same words the rack uses, and stop the account like X and LinkedIn do.
  Posts, comments, stories and questions on the page never count. The
  stop survives the next run; only "Let it run again" clears it. Lines about
  somebody else ("This account has been suspended" on another person's
  profile) never count.
- **A suspended Reddit reading stops the account.** The daily reading from
  outside sets the stop with "Reddit reads this account as suspended", drops
  its waiting jobs, records a ban of the kind "read as suspended", and rings
  once. A later clear reading doesn't restart it.
- **New ban wording.** After every app action the rack also looks for
  "suspended", "banned", "disabled", "locked", "violat" or "restricted" in a
  short line spoken to the account ("your account..."), on a short screen
  that matched nothing it knows. A line with "no" or "not" just before the
  ban word ("You have no violations") is the app saying all is well. That stops the account, keeps the picture,
  and asks: the bell says "Promo doesn't know this screen. Is it a ban?" and
  the Bans dashboard shows the screen with **It's a ban** and **Not a ban**.
  The answer applies to every account that same screen stopped, not only
  the last one asked about. "It's a ban" records the ban and teaches the rack the line, which it
  fetches with its next action, so the next copy is a normal ban. "Not a
  ban" lets the account run again at full pace and teaches the rack the line
  is harmless, so the same screen never stops it twice. A question ("Account
  suspended after one comment?") or a line about someone else never asks.
- **The ban picture is kept.** The last step picture of the action that found
  the ban is copied to a key of its own, still encrypted, and the step
  pictures' tidy-up never deletes it. The ban card and the Bans dashboard
  show it; a click shows it full size.
- **The brake.** A second counted ban of one app inside 24 hours pauses every
  account on that app, on phones and in browsers. The bell says "Two
  Instagram bans in a day. Every Instagram account is paused." Their jobs
  wait and are not failed, like a held phone's, and Post says why. Other
  apps keep running. Release is on the Bans dashboard and in Settings →
  Phones; nothing restarts by itself. The brake is its own record, never an
  account's pause, so Release never resumes an account a person paused.

## Records and dashboards (parts 12 to 18)

- **The Bans dashboard** is `/admin/bans`, under Anti Detect in the left
  menu, after Phones. Columns: the account, when, the app, the kind, the
  phone or profile, the proxy or SIM carrier, how old the account was, its
  posts in the week before, the seller, the appeal, and what happened since
  (stopped, let run again, cleaned up, looks back). Filters by app, kind,
  phone, proxy, seller, project and date live in the address. Each row opens
  the ban's window: the picture, the screen's words, the appeal, Let it run
  again and Clean up, and the phone's last 20 actions before the ban. An
  empty list says "No account has been banned yet".
- **Above the list,** only when there is something: the apps the brake holds,
  each screen Promo is asking about, and the sellers.
- **Each account's own history** is the History tab of its settings window:
  added, moved, banned, appealed, the appeal's answer, let run again,
  retired with its reason, and cleaned up, newest first. Lines start from
  this task; nothing older was recorded.
- **Why it was retired.** Retire asks in its window: Banned, Sold, Given up,
  or Other with a short note. Clean up fills in Banned. A retired row says
  "Retired 2 days ago · Sold", accounts retired before read "Not recorded",
  and with Show retired on, a filter splits them by reason.
- **Where it came from.** Made or bought, the seller and the price in
  dollars, in the add-account window and the account's settings window,
  saved as they change. The Bans dashboard groups bans by seller: "Seller A:
  4 bans out of 10 bought, $120 lost". A seller counts the accounts a counted
  ban hit, and the dollars are what those accounts cost.
- **Counts per app.** A strip at the top of the Accounts dashboard has one
  card per app with accounts, counting Warming up, Ready, Working, At risk
  and Banned among the accounts in use. Clicking a count filters the list to
  that app and status.
- **Lost accounts per project.** Each project's row and its left column say
  "2 accounts banned in the last 30 days", counting accounts a counted ban
  hit. Clicking it opens the Bans dashboard filtered to that project and the
  last 30 days. Nothing shows when there are none.

## Keeping accounts alive (parts 19 to 24)

- **Instagram and TikTok warm up for 7 days,** counted from when the account
  was added to Promo, a number in Settings → Behaviour, and the account reads
  Warming up on the Accounts dashboard until then. Post is refused with the
  day it ends. Once a day inside waking hours the phone opens the app,
  scrolls the feed for a few minutes and likes a few posts by pressing each
  post's own Like button found on screen. Nothing else is ever pressed, a
  like counts only once the button reads Liked, and a ban screen ends the
  visit. It never posts, comments or follows. The self-test walks the visit to
  the feed and likes nothing.
- **Half pace.** The account row says why, in amber: "Half pace while
  shadowbanned", "Half pace until 10 Nov" after "Let it run again", or "Half
  pace: an account on the same phone was banned" for 2 days after a ban on
  its phone, proxy or SIM. While slowed, every Post check applies half of
  the limits in Settings → Behaviour whatever the account's age, X follows
  half as many a day, LinkedIn sends half as many requests a week, the
  Instagram and TikTok warm-up likes half as many posts, and the Reddit,
  Medium, X and LinkedIn warm-up visits come every other day. A clear shadowban
  reading lifts it; a reading that could not be read changes nothing.
- **At risk** is a status worked out on each read, in amber. An account is At
  risk when it is shadowbanned, X reads its replies hidden or folded,
  LinkedIn reads its comments hidden, it hit a locked or "confirm it's you"
  screen in the last 7 days, or another account on its phone, proxy or SIM
  was banned in the last 2 days. The line under the status names the sign.
  Banned wins over At risk, and a status a person set by hand stays theirs.
- **Throwaway first.** An important account's first comment in a subreddit is
  refused until a throwaway's comment there has stayed up 24 hours: "Post
  from a throwaway in r/name first." Important accounts only run on phones,
  where the Reddit app only comments, so a comment is the only post there.
  On Instagram and TikTok it covers the first photo, the first video and
  the first carousel of pictures instead. The throwaway must not be banned, and its comment must not be
  removed or deleted. Any throwaway counts, so the apart rules still hold.

## After a ban (parts 25 and 26)

- **The appeal.** The ban card has **I appealed**, which records today and an
  optional note. After 7 days with no answer the bell says "No answer to
  u/name's appeal yet", once. **Answer came: won** offers Let it run again
  (and the slow restart applies); **lost** offers Clean up. Appeals are sent
  by hand in the app; Promo only keeps the record.
- **The weekly look.** A week after the ban, then weekly, inside the
  account's waking hours, the phone opens the banned account's app and reads
  the screen. It never taps, scrolls, posts or types. A browser account gets
  its network's own look at who is signed in. With the app open and signed
  in and no ban screen, the bell says "Looks back: u/name. Let it run again?" and the account keeps its ban
  until a person presses the button. A ban screen still showing rings
  nothing, and neither does an app that opened signed out or showed nothing
  of its own yet, because a disabled account is often only signed out. Retired and cleaned-up accounts are skipped, and a held or
  offline phone waits until the next week.

## What is proved and what is not

- **Proved by tests:** every rule above on the server (`src/server/bans/bans.test.ts`),
  the rack's unknown screens, learned lines, warm-up and look
  (`rack/test_promo_rack.py`, `BansTest`), and the browser ban pages
  (`docker/browser/test_bans.py`).
- **Not proved on a real phone yet.** No real ban has happened, so the ban
  wording, the unknown-screen words, the double-tap like and the weekly look
  all need proving on the first real one. The rack program's version was
  raised to `2026.11.03.1` so racks take the new steps on the next deploy.
- **The browser image needs a rebuild.** Reddit's and Medium's ban pages are
  read by the routines in `docker/browser/routines/`, which the browser
  image copies in, so part 7 reaches a browser only once that image is
  rebuilt.

## Where it is

- **Rules and records:** `src/server/bans/`: `record.ts` (the ban row, the
  picture and the brake), `rules.ts` (counts, refusals, half pace, At risk),
  `history.ts` (account history and phone rows), `clean-up.ts`,
  `phrases.ts` (unknown screens), `appeals.ts`, `look.ts`,
  `throwaway-first.ts`, `browser.ts` (Reddit and Medium ban pages),
  `dashboard.ts`, `upkeep.ts` (on the ticker as `promo-bans`), `schema.ts`.
- **Words and numbers:** `src/lib/bans/options.ts`.
- **Screens:** `src/components/bans/bans-dashboard.tsx`,
  `src/components/social/accounts/ban-card.tsx`, `retire-dialog.tsx`,
  `account-counts.tsx`, `account-source.tsx`, `account-history-panel.tsx`.
- **Tables:** `drizzle/0133_promo_bans.sql` adds `promo_bans`,
  `promo_phone_tenancies`, `promo_ban_phrases`, `promo_account_events`,
  `promo_app_brakes`, and account columns for the retire reason, the source,
  and the slow restart. Nothing stored was renamed.
