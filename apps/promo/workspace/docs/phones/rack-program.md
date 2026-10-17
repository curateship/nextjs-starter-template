# The rack program

A small program on the computer the phones plug into. It finds the phones over
USB, tells Promo which are there, runs one named action on one phone when
Promo asks, and sends back the answer and any pictures. It is the only thing
that touches the phones.

Tyler's answers, 13 Oct 2026: Android's own USB tools (adb) with uiautomator2
drive the phones, the program dials out to Promo, and the first rack is his own
Mac. It also runs on Linux.

## How it reaches Promo

The program calls Promo. Promo never calls the house, so no port is opened at
home and nothing changes on the Hetzner server.

- **Every 15 seconds** it checks in at `/api/rack/check-in` with the phones adb
  sees, each phone's model, Android version and time zone, and its own version.
  Once a minute each phone's reading rides along: battery, heat, storage, the
  SIM's signal, the time since it started, and every ten minutes its app
  versions. A thread of its own takes the readings, so a slow phone never
  holds up a check-in. [A phone's health](phone-health.md) has the rest.
- **Each minute it also reads the phone's notifications,** without opening an
  app. A Reddit chat, an Instagram or TikTok message, or a comment under an
  Instagram or TikTok post is an alert, carried on the next check-in as the
  app and "message" or "comment", never the words. Each notification is
  reported once; an alert Promo did not hear waits for the next check-in.
  Promo then has the account's phone read it
  ([the Messages dashboard](../messages-dashboard.md)).
- **Every 3 seconds** it asks `/api/rack/next` for the oldest waiting action,
  and asks again at once after taking one. Promo hands each phone one action
  at a time; the program runs each on a thread of its own, so two phones
  work side by side.
- **The answer** goes to `/api/rack/result`, with a picture of each step,
  shrunk to 540 pixels wide ([a picture of every step](step-pictures.md)),
  any ban screen found after an app action, and what was done about a freeze.
  It is tried five times, because a comment that went out must be reported.
- **Each action carries its own time limit.** A check has five minutes; a
  job's Reddit step has the browser's own limit for that step. The program
  gives up a minute before the limit, reopens a frozen app or restarts a
  phone that stopped answering ([freezes and ban screens](freezes-and-ban-screens.md)),
  and never runs the action again. One the rack never answers is failed by
  Promo: "The rack did not answer in time."
- **While a screen window is open,** a third thread sends that phone's screen
  to `/api/rack/screen` about three times a second and carries back the taps.
  [The screen window](screen-window.md) has the rest.
- **It never switches version under a running action,** and waits for the
  actions to finish first.

## The actions

Named, like the browser's routines, and the only things ever run. A name not
on both lists is refused by whichever side does not know it: Promo's list is
`PHONE_ACTIONS` in `src/lib/phones/options.ts`, the rack's is `ACTIONS` in
`rack/promo_rack.py`.

- **`phone/list`:** the phones adb sees.
- **`phone/health`:** battery, temperature, free storage, whether the screen is
  on, how long it has been on.
- **`phone/android-version`:** the test of the whole path. It opens Settings at
  About phone, reads the Android version off the screen with a picture of
  each step, then goes back home. On a Samsung it opens Software information
  first. The answer is checked against the version Android itself reports, so
  a wrong read shows as "Settings says 15, but Android itself reports 16".
- **`phone/self-test`:** walks every action in `REHEARSALS` up to its last
  button and never presses it. Promo asks once a day on the test phone.
- **`phone/check-updates`:** opens each tracked app's Play Store page and reads
  whether Update shows. Presses nothing.
- **`phone/update-app`:** presses Update on one app's Play Store page and waits
  up to eight minutes for the new version.

The last three are Promo's own, never a button on a phone's window. [The
self-test and app updates](self-test-and-app-updates.md) has them.

- **`phone/setup-check`:** Wi-Fi, location permissions, the clock, the
  language, the SIM, the battery, the Play Store's auto-update setting, and the
  address apps see beside the house's own. Each part is read on its own, so
  one that fails leaves the rest.
- **`phone/outside-address`:** only the two addresses, before every job on a
  Wi-Fi phone.
- **`phone/wipe`:** a factory reset through Settings. The erase is pressed
  through the last-button guard, so a rehearsal never presses it, and it is
  never rehearsed.
  [Making each phone look like one person's](looking-like-a-real-person.md)
  has all three.
- **`reddit/state`, `reddit/quick_state`, `reddit/health` and
  `reddit/comment`:** the Reddit app's own steps, answering in the browser's
  shapes. [Reddit on phones](../reddit/reddit-on-phones.md).
- **`reddit/inbox` and `reddit/reply_message`:** reading a Reddit chat and
  answering it ([the Messages dashboard](../messages-dashboard.md)).
- **`instagram/…` and `tiktok/…`:** `state`, `quick_state`, `health`,
  `profile`, `post`, `inbox` and `reply` in each app, the same steps read off
  each app's own buttons in `APP_SCREENS`.
  [Instagram and TikTok accounts, and the daily reading](../instagram/accounts-and-the-daily-reading.md).

Every action that touches the screen walks it as named steps through the
`Walk` class, which keeps a picture of each, stops pressing anything once the
action is given up on, and in a self-test only finds the last button. A
button an app update may rename is looked for in each of its known shapes
(`find_first`), and a press lands a little off the button's middle
(`tap_point`), like a thumb.

## Pairing

Nobody but Tyler's Promo can drive the phones.

- **A one-time code.** Rack, then Make a pairing code, on the Phones dashboard
  shows a code such as `ABCD-EFGH` and the whole install command with it. The
  code works once, for 15 minutes. Promo keeps only its hash.
- **Swapped for a key.** The program sends the code to `/api/rack/pair` once
  and gets back its own key. Promo keeps the key encrypted with the server's
  key (`CUSTOM_SHELL_SECRET_ENCRYPTION_KEY`), so pairing is refused on a server
  without one, and the code still works once the key is set. The pairing address allows 10 tries per 15 minutes from one
  internet address.
- **Every message is signed, both ways.** A message from the rack is signed
  over its address, the time, a random word and its body. Promo's answer is
  signed over its status, that same random word, the time and its body. A
  changed message, one sent twice, one more than five minutes off the clock,
  or an answer without the right signature is refused. The rule is
  `src/server/phones/signing.ts` and the same lines in `rack/promo_rack.py`,
  and both are tested against one fixed example so the two cannot drift.
- **Disconnect this rack**, in the Rack window, cancels the key at once. Every
  message after that is refused, waiting checks are cancelled, the rack's
  phones show offline, and nothing reaches them until it is installed again
  with a new code. The phone records and the accounts on them stay.

## Installing

One command, pasted into Terminal on the computer the phones plug into:

    curl -fsSL https://<promo>/api/rack/install.sh | bash -s -- ABCD-EFGH

It puts everything in one folder of the person's own
(`~/Library/Application Support/PromoRack` on a Mac,
`~/.local/share/promo-rack` on Linux) and needs no password:

- Android's platform tools, downloaded from Google into that folder.
- A Python of its own with uiautomator2 3.7.0. macOS's own Python 3.9 is
  enough.
- The launcher and the program, downloaded from Promo, then paired with the
  code.
- A service that starts with the computer: a LaunchAgent on a Mac, which starts
  when Tyler signs in, and a systemd user service on Linux. The log is
  `rack.log` in that folder on a Mac, and `journalctl --user -u promo-rack` on
  Linux.

Running it again with a new code pairs afresh. The install script holds nothing
secret, which is why its address is public. The address written into it is
the app's own setting, never the request's, so a forged address cannot point a
new rack somewhere else.

Each phone needs USB debugging on once: Settings, About phone, tap Build
number seven times, then Developer options, USB debugging. Plugging it in shows
a question on its screen, and it stays offline with "Allow USB debugging on its
screen" until someone taps Allow.

## Updating itself

The computer never needs a terminal after the first command.

- **The version is one line**, `VERSION = "..."` at the top of
  `rack/promo_rack.py`. Promo builds that file into itself and serves it, so
  a deploy with a raised version is a new release. The Rack window shows the
  version each rack runs.
- **Every check-in's answer** names the version Promo serves. A rack on another
  one downloads it from `/api/rack/release`, an answer signed with its own key
  like every other, checks the file's checksum and its VERSION line, and
  switches.
- **Two minutes to check in.** The launcher (`rack/launcher.py`) runs the
  program and is never updated itself, because it is the part that has to
  keep working when a new version does not. A new version that stops before it
  checks in, or is still running two minutes later without having checked in,
  is stopped. The launcher goes back to the version before it and never tries
  that version again.
- **The dashboard says so.** The old version reports the rollback on its next
  check-in, and the Rack window shows it in red: "Went back to 2026.10.13.1 on
  2026-10-13 22:01 UTC, because 0.0.0-broken stopped with code 1 before it
  checked in." It stays until the next good update.
- **To watch a rollback happen**, run this on the rack computer:

      ~/Library/Application\ Support/PromoRack/venv/bin/python \
        ~/Library/Application\ Support/PromoRack/launcher.py selftest-rollback

  It switches to a version that cannot start. The launcher goes back within
  seconds and the note shows on the dashboard within 15.

## Checking it without a phone

- `npx vitest run src/server/phones src/components/phones` covers Promo's side.
- `python3 -m unittest discover -s rack -p "test_*.py"`, from `apps/promo`,
  covers the program: the device list, reading the Settings screen, the shared
  signing example, both kinds of rollback, the readings, the self-test never
  pressing Post, every saved ban screen, reopening a frozen app or
  restarting a frozen phone, the setup check's readings, the wipe, the Reddit
  app's screens, Instagram's and TikTok's screens (`rack/fixtures/instagram/`
  and `rack/fixtures/tiktok/`), the notifications that are alerts and those
  that are not (`rack/fixtures/notifications/`), a post, an answer and a
  profile change pressing their last button once and a rehearsal never, and
  taps, swipes and typing like a person. pytest is not needed.
- `python3 rack/promo_rack.py phones` prints what adb sees, for checking a
  phone by hand.

A real phone on the rack is the only proof that an action works on a phone.

## Where it is

- The program: `rack/promo_rack.py`, `rack/launcher.py`, `rack/install.sh`.
- The addresses it calls: `src/routes/api/rack/`, each handing its request to
  `src/server/phones/rack-http.ts`.
- The work: `src/server/phones/rack.ts` (pairing, checking a message, check-ins,
  the action queue, Disconnect) and `src/server/phones/release.ts` (the files
  Promo serves).
- The tables: `promo_racks`, `promo_rack_codes`, `promo_rack_nonces`,
  `promo_phone_actions` and `promo_phone_screenshots`, in
  `drizzle/0114_promo_phones.sql`, with the step pictures, readings and
  freezes added by `drizzle/0116_promo_phone_health.sql`.
- Out of scope here: more than one rack (file 07), restarting a phone by
  cutting its power, phones on Hetzner, emulators and cloud phones.
