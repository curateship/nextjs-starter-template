# The rack program

A small program on the computer the phones plug into. It finds the phones over
USB, tells Promo which are there, runs one named action on one phone when
Promo asks, and sends back the answer and any pictures. It is the only thing
that touches the phones.

Tyler's answers, 13 Oct 2026: Android's own USB tools (adb) with uiautomator2
drive the phones, the program dials out to Promo, and the first rack is his own
Mac. It also runs on Linux.

Since 18 Oct 2026 iPhones sit on the same rack (phone farm file 08). The
program itself never speaks to an iPhone: `rack/iphone.py`, the driver beside
it, does, through pymobiledevice3 (Apple's USB channel) and WebDriverAgent
(Apple's own test tool, signed with a free Apple ID that runs out every 7
days). The program asks the driver for four things: the list of iPhones, a
screen object that answers like a uiautomator2 device, the minute's reading,
and when the WebDriverAgent signature runs out. Every helper that touches a
phone looks up the phone's kind first (`_KINDS`, `is_iphone`) and goes to adb
or to the driver. A rack without the driver file, or with a driver that
fails, lists no iPhones and says so once in the log; the Androids are never
held up by it.

## How it reaches Promo

The program calls Promo. Promo never calls the house, so no port is opened at
home and nothing changes on the Hetzner server.

- **Every 15 seconds** it checks in at `/api/rack/check-in` with the phones adb
  sees and the iPhones the driver sees, each phone's kind (`android` or
  `iphone`), model, system version and time zone, and its own version. An
  iPhone's serial is its UDID, and it has no USB port name, because Apple
  does not say. The body also carries `wdaExpiresAt`, when the WebDriverAgent
  signature runs out (ISO 8601 with an offset, or null on a rack without
  iPhones), so the bell can warn the day before.
  Once a minute each phone's reading rides along: battery, heat, storage, the
  SIM's signal, the time since it started, and every ten minutes its app
  versions. An iPhone's reading comes from the driver over Apple's
  diagnostics channel; its signal is `not_reported`, never a guess, and its
  app versions are left blank unless the driver offers `app_versions`.
  A thread of its own takes the readings, so a slow phone never
  holds up a check-in. [A phone's health](phone-health.md) has the rest.
- **Each minute it also reads the phone's notifications,** without opening an
  app. A Reddit chat, an Instagram or TikTok message, or a comment under an
  Instagram or TikTok post is an alert, carried on the next check-in as the
  app and "message" or "comment", never the words. Each notification is
  reported once; an alert Promo did not hear waits for the next check-in.
  Promo then has the account's phone read it
  ([the Messages dashboard](../messages-dashboard.md)). An iPhone hands a
  computer no notifications, so it has no alerts here; its inboxes are
  opened on the screen instead (part 52, not built yet).
- **Every 3 seconds** it asks `/api/rack/next` for the oldest waiting action,
  and asks again at once after taking one. Promo hands each phone one action
  at a time; the program runs each on a thread of its own, so two phones
  work side by side.
- **When that answer says `sendLog: true`,** the program posts the last 300
  lines of `rack.log` to `/api/rack/log` as `{"lines": [...]}`, each line cut
  to 2000 characters, signed like every call, on a thread of its own so the
  action poll is not held up. Only the end of the file is ever read, one
  post runs at a time, and a rack with no log file (Linux keeps it in the
  journal) sends an empty list. The Log tab in the Rack window shows them.
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
  Each frame says `"lane": "window"`. An iPhone's picture comes through
  WebDriverAgent, and its taps, swipes, typing and the Back, Home, Recent
  apps, Enter and Delete keys go through the driver, which turns Back and
  Recent apps into the iPhone's own swipes.
  [The screen window](screen-window.md) has the rest.
- **While the wall is open,** the same thread sends a small picture of each
  phone Promo names in the reply's `wall` list: 270 pixels wide, at most one
  every 5 seconds per phone, marked `"lane": "wall"` in the same `frames`
  list. The wall's pictures ride on whichever turn is due, so a window's
  three turns a second are never slowed. With only the wall open the thread
  turns once a second.
- **Texted codes on an iPhone** are read off the screen, because iOS gives a
  computer neither the inbox nor the notifications: Messages is opened, the
  newest conversation from today is read for a 4 to 8 digit code from the
  last ten minutes, and the phone goes home. That happens only while the
  window is watched with control on and never while an action runs on
  that phone, every 6 seconds at most. The reply's `control` list names the
  phones someone has control of right now; a Promo from before that list
  is read the old way, as a tap within the last 15 minutes. Android's inbox
  is read over USB as before.
- **It never switches version under a running action,** and waits for the
  actions to finish first.

## The actions

Named, like the browser's routines, and the only things ever run. A name not
on both lists is refused by whichever side does not know it: Promo's list is
`PHONE_ACTIONS` in `src/lib/phones/options.ts`, the rack's is `ACTIONS` in
`rack/promo_rack.py`.

- **`phone/list`:** the phones adb sees, then the iPhones the driver sees.
- **`phone/health`:** battery, temperature, free storage, whether the screen is
  on, how long it has been on. On an iPhone it is the minute's reading from
  the driver, with `kind: "iphone"`, the model and the iOS version.
- **`phone/android-version`:** the test of the whole path. It opens Settings at
  About phone, reads the Android version off the screen with a picture of
  each step, then goes back home. On a Samsung it opens Software information
  first. The answer is checked against the version Android itself reports, so
  a wrong read shows as "Settings says 15, but Android itself reports 16".
  On an iPhone it opens Settings, taps General, then About, and reads the
  "iOS Version" row (the label and the number are two elements side by side
  in one cell), checked against the version the phone reports over USB; the
  answer carries `kind: "iphone"`.
- **`phone/self-test`:** walks every action in `REHEARSALS` up to its last
  button and never presses it. Promo asks once a day on the test phone.
- **`phone/check-updates`:** opens each tracked app's Play Store page and reads
  whether Update shows. Presses nothing. On an iPhone it opens each app's App
  Store page by Apple's own number (Reddit 1064216828, Instagram 389801252,
  TikTok 835599320) through an `itms-apps://apps.apple.com/app/id...`
  address; the version is the driver's `app_versions` when it offers that,
  else the page's own "Version" line, and a page offering Get is an app not
  on the phone.
- **`phone/update-app`:** presses Update on one app's Play Store page and waits
  up to eight minutes for the new version. On an iPhone it presses Update on
  the App Store page; with the driver's versions it waits for the number to
  change, without them it waits for Update to go and Open to come back.
  Install is a last button, like Post, so a rehearsal can never press it.

The last three are Promo's own, never a button on a phone's window. [The
self-test and app updates](self-test-and-app-updates.md) has them.

- **`phone/setup-check`:** Wi-Fi, location permissions, the clock, the
  language, the SIM, the battery, the Play Store's auto-update setting, and the
  address apps see beside the house's own. Each part is read on its own, so
  one that fails leaves the rest. On an iPhone the same facts, under the same
  names, come from iOS's own screens: Settings, Wi-Fi (the switch); Settings,
  Privacy & Security, Location Services (each app's row, Never and Ask Next
  Time being off, and the whole switch off being off for every app); the time
  zone the phone reported over USB when it was listed; Settings, General,
  Language & Region (the language and the region turned into en-CA through a
  table of common names, left blank when a name is not in it); Settings,
  General, About (the Carrier and Network rows; iOS shows no SIM country, so
  that stays blank); Settings, App Store (the App Updates switch: on is
  "any", off is "off"); the battery from the minute's reading, with no word on
  charging; and ipinfo.io opened in Safari. Settings is closed and opened for
  each part so each starts on the first screen, and a part that cannot be
  read is left blank, never guessed.
- **`phone/outside-address`:** only the two addresses, before every job on a
  Wi-Fi phone. On an iPhone the address is read in Safari.
- **`phone/icloud-state`:** iPhones only. Opens Settings and reads its top
  row: the person's name beside Apple ID, or "Sign in to your iPhone". The
  answer is `{"signedOut": true|false, "appleId": "<name or empty>"}`, and
  nothing is pressed. It is rehearsed by the self-test, since it only reads.
- **`phone/wipe`:** a factory reset through Settings. The erase is pressed
  through the last-button guard, so a rehearsal never presses it, and it is
  never rehearsed. On an iPhone the wipe is refused, with the reason, unless
  Promo sends `icloudSignedOut: true`, because an iPhone erased while signed
  in to an Apple ID is locked to that Apple ID. Then it walks Settings,
  General, Transfer or Reset iPhone, Erase All Content and Settings,
  Continue, and the final Erase iPhone through the guard (pressed again if
  iOS asks once more). A passcode prompt stops it with a picture and "The
  phone asks for its passcode; wipe it by hand".
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
  On an iPhone a post's file cannot be pushed onto the phone, so Promo sends
  `mediaFromSafari: true` with a one-time link (good for ten minutes and one
  download). The rack opens the link in Safari through the driver, waits for
  the picture or video to show, holds a thumb on it for a second (the driver
  has no long press, so it is a swipe with no distance), taps Save to Photos
  or Add to Photos (a video goes through Safari's share sheet instead), goes
  home, and the app's own create screen then picks the first item in its
  library, the newest. A rehearsal opens no link and saves nothing: it walks
  the create screen with whatever the test phone's Photos holds. A profile
  picture reaches the phone the same way. On Android nothing changed.

Every action that touches the screen walks it as named steps through the
`Walk` class, which keeps a picture of each, stops pressing anything once the
action is given up on, and in a self-test only finds the last button. A
button an app update may rename is looked for in each of its known shapes
(`find_first`), and a press lands a little off the button's middle
(`tap_point`), like a thumb.

On an iPhone the same walk runs against the driver's screen object. The apps
are named by bundle id (`APP_BUNDLES`: Reddit `com.reddit.Reddit`, Instagram
`com.burbn.instagram`, TikTok `com.zhiliaoapp.musically`; Settings
`com.apple.Preferences`, Messages `com.apple.MobileSMS`, the App Store
`com.apple.AppStore`, Safari `com.apple.mobilesafari`), and `package_for`
picks the bundle or the Android package by the phone's kind. Typing goes one
character at a time through the driver, so the rhythm between keys is the
same on both kinds; a swipe is straight, because WebDriverAgent draws it so.
What an iPhone cannot do: it hands over no notifications, Apple names no USB
port, its signal is not reported, iOS shows no "isn't responding" box to
close, and the rack cannot restart it unless the driver offers `restart`.
A frozen iPhone that the driver cannot restart is never marked as
restarting; the action's answer says it needs a hand.

The three apps on an iPhone (part 51): each app's iPhone buttons join
`APP_SCREENS` under its bundle id, every button in its known iOS shapes, by
accessibility label or accessibility id, and a text box is a text field,
text view or search field. `app_screens(serial, app)` picks the Android
entry or the iPhone one by the phone's kind, so every action walks the same
named steps on both and Promo shows the same step names. The readers (who
is signed in, the profile's figures, a conversation, the comments, a post's
numbers, the Account status page, the ban screens) read the iPhone tree as
well, since the driver gives each node's label as its text; what they skip
on an iPhone is the app's own root node and its buttons, which are no lines
anyone wrote. Leaving a screen on an iPhone also closes the app, so no
draft stays open. Every iOS shape here was written from how the apps are
known to look (18 Oct 2026), not dumped from a phone; the first self-test on
the iPhone test phone is the proof, and a step that does not find its
button stops with a picture of the screen.

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
- The launcher, the program and the iPhone driver (`iphone.py`), downloaded
  from Promo, then paired with the code. Every later version carries the
  driver inside the signed release, checked by its checksum.
- On a Mac with Xcode, the iPhone tools: pymobiledevice3 11.34.1 and
  WebDriverAgent, fetched at one pinned commit (the one tag v16.15.3 pointed
  at on 18 Oct 2026) and refused if the download is anything else, since
  what gets signed with the Apple ID drives every iPhone. A Mac without Xcode,
  or Linux, says so and drives Androids only. `wda.sh` in that folder signs
  WebDriverAgent; a free Apple ID's signature lasts 7 days.
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
  switches. The same answer carries the iPhone driver (`driver` and
  `driverSha256`), checked the same way and written as `iphone.py` beside the
  new `promo_rack.py`, so `import iphone` works on the rack; an answer
  without it installs the program alone.
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
  taps, swipes and typing like a person. The iPhone side (`IphoneTest`) stands
  a fake driver in: the merged list and a failing driver, every helper going
  to the driver and never adb, the iOS Version row, the window's taps, the
  texted-code read refusing under an action or with control off, the wall's
  pace and lane, the log post, the check-in's kind and `wdaExpiresAt`, and
  the driver written beside an update. `IphoneAppsTest` stands a fake iPhone
  in whose screen is a tree read with the driver's own matcher
  (`rack/fixtures/ios/`): an Instagram post through Safari and the picker, a
  Reddit comment and a TikTok reply each pressing their last button once and
  a rehearsal never, the setup facts off iOS screens with one part failing,
  the App Store's Update read and pressed, the iCloud row both ways, the wipe
  refused without Promo's word and walked with it, the passcode prompt, and
  the Safari save. pytest is not needed.
- `python3 rack/promo_rack.py phones` prints what adb sees, for checking a
  phone by hand.

A real phone on the rack is the only proof that an action works on a phone.
For an iPhone that means: the first picture in the window, a tap opening an
app, Back leaving it, typing landing in a field, the About screen's row
reading as the driver's tree really lays it out, the Messages list's rows
reading as sender, time and preview, the wall's pictures, each app's buttons
being named as the iOS shapes say, Settings' rows and switches reading as
written, the App Store's Update button, the Apple ID row, the wipe's screens
up to Erase iPhone, and Safari's long-press menu and Save to Photos. None of
that has been seen on a real iPhone yet (18 Oct 2026).

## Where it is

- The program: `rack/promo_rack.py`, `rack/launcher.py`, `rack/install.sh`,
  and the iPhone driver `rack/iphone.py`.
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
