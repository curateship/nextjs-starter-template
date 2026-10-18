# iPhones on the rack

iPhones sit on the rack beside the Androids and do the same work: run Reddit,
Instagram and TikTok in the real apps for important accounts. Phone farm file
08, parts 47 to 56. This page is Promo's side; the rack's side (finding an
iPhone over USB, tapping it through WebDriverAgent, its screen pictures) is in
[the rack program](rack-program.md).

Nothing here has run on a real iPhone yet. Every part below is proved by
Promo's own tests; the lines at the end say what only a real iPhone on the
rack can prove.

## Tyler's decisions, 18 Oct 2026

- WebDriverAgent, the tool the rack taps iPhones through, is signed with a
  free Apple ID. It dies every 7 days and a person re-signs it in Xcode; the
  bell warns a day before.
- Same rule as Android for who goes on an iPhone: important accounts only.
  Throwaways stay on browser profiles.
- iPhone message and comment alerts: open each inbox once an hour in waking
  hours.
- The phones: used iPhone 11 to 13, iOS 17 or newer. Older is refused with a
  line saying why.
- A spare iPhone is bought as the iPhone test phone. Settings, Phones has a
  second test-phone slot, one per kind.
- Promo stays on Hetzner. The rack at home dials out, as it does now. The
  iPhone tools run on the rack Mac beside adb; Hetzner never touches a phone.

## A phone's kind

- **Every phone record says which kind it is,** Android or iPhone. The rack
  reports it on every check-in; a phone typed in by hand says it on the form.
- **The system version keeps its old column.** `android_version` is never
  renamed (Tyler's rule); on an iPhone it holds the iOS version and the row
  reads "iOS 17.6".
- **The words follow the kind:** "Tap Trust this computer on its screen"
  where an Android says "Allow USB debugging", "Read the system version from
  Settings" on the Actions tab, and "Not reported" for the SIM's signal,
  which an iPhone does not give the rack. Nothing is guessed.

## The self-test, one test phone per kind

- **Two slots in Settings, Phones:** "The Android the daily self-test runs
  on" lists only Androids, "The iPhone the daily self-test runs on" lists only
  iPhones. A phone of the other kind is refused for a slot, and so is one that
  runs a real account. Both test phones are left off every "Runs on" list.
- **Each kind's self-test runs on its own clock.** Once a day the rack walks
  every action on the Android test phone, and once a day on the iPhone test
  phone; one waiting for its phone to come back does not hold up the other.
- **The answers are kept per kind.** "Post a Reddit comment broken on iPhone"
  refuses iPhone jobs only and leaves the Android jobs running. The bell says
  "Self-test failed on iPhone: Post a Reddit comment"; the Android one reads
  as before. A job's step is judged by the self-test of the phone it is about
  to run on.
- **App updates go round each kind on their own.** The daily store look reads
  the Play Store on the Android test phone and the App Store on the iPhone
  test phone. "App update out: Reddit on iPhone" starts the iPhone round: the
  iPhone test phone updates first, the self-test runs on it, and only once it
  passes does "Update the other iPhones" put it on the other iPhones. The
  Androids are never touched by an iPhone round.
- **The Self-test window** has a side per kind, each with Run it now, and says
  "the App Store" where the iPhone side means it.

## Health and the bell

- **Battery, heat, storage and uptime** come over Apple's diagnostics channel
  into the same once-a-minute reading as an Android's, so the chart and the
  offline, hot and storage bells are unchanged ([a phone's
  health](phone-health.md)). Signal reads "Not reported".
- **WebDriverAgent running out.** The rack reports when its signature runs
  out. Within a day of it the bell rings once, "WebDriverAgent on the rack
  runs out tomorrow; re-sign it in Xcode". Once it has run out it rings once
  more, "WebDriverAgent on the rack has run out; its iPhones are offline until
  it is re-signed". Both notices say what to do: on the rack Mac, run
  `bash ~/Library/Application Support/PromoRack/wda.sh` and follow its
  prompts. A later check-in with the date moved on takes them away.

## Messages and comments on an iPhone

An iPhone hands a computer none of its notifications, so the inbox cannot be
opened "when the phone buzzes" as on an Android.

- **Once an hour, in waking hours,** Promo queues a read of each iPhone
  account's inbox, one for messages and one for comments, through the same
  inbox read an Android gets after a notification, only recorded as the inbox
  being opened (there was no notification to tap). The Messages dashboard then
  reads what arrived exactly as it does on an Android.
- **At night nothing is opened.** The hour is counted on the phone's own clock
  against the waking hours on Settings, Behaviour.
- **Left alone:** a retired or paused account, one stopped by a ban screen,
  and an account whose iPhone is offline or held. That one is asked on the
  next tick instead.
- **The visit counts** as one of the account's behaviour visits, so a young
  account's pace includes it.
- **Where it is kept:** `promo_accounts.inbox_asked_at`, when Promo last asked
  for that account's inbox of its own accord. Null on an Android account.

## The setup check on an iPhone

The same seven lines as an Android's ([making each phone look like one
person's](looking-like-a-real-person.md)), read from iOS by the rack, with
the words naming the iPhone's own settings:

- **Automatic app updates off** reads the App Store's App Updates switch
  (Settings, App Store, App Updates).
- **Charging stops near 80** is read from the battery readings as on an
  Android; when it fails, the line names Settings, Battery, Charging, 80%
  Limit on an iPhone 15 or newer, and Optimized Battery Charging on an older
  one.
- **Goes out through a proxy**, on a Wi-Fi phone, says the proxy is forced by
  a VPN-style proxy app on the phone, on both kinds.

## Wiping an iPhone without bricking it

An iPhone erased while still signed into an Apple ID is locked to that Apple
ID and useless to the rack.

- **Promo refuses the wipe** until the rack has read the phone as signed out:
  "Sign out of iCloud on its screen first (Settings, your name, Sign Out),
  then press Check iCloud. An iPhone erased while signed in is locked to that
  Apple ID."
- **The sign-out is done by a person** through the screen window. The Apple
  ID password is typed by that person and never saved.
- **Check iCloud,** on the iPhone's Setup tab, asks the rack to read whether
  an Apple ID is signed in. The last answer shows beside it in words, with
  who is signed in when someone is. The answer lives on the phone's finished
  actions, so it survives a reload. A read from before the phone's last wipe
  does not count, because a fresh setup signs in again.
- **The wipe itself** goes to the rack carrying the word `icloudSignedOut:
  true`; the rack refuses an iPhone wipe without it. The rack walks Settings
  to Erase All Content and Settings, with the erase as a last button a
  rehearsal never presses.
- **After the wipe** the phone is held and its history says: tap Trust this
  computer when it asks, sign in to an Apple ID, put the apps on from the App
  Store, then release it and run its setup check. The confirmation window
  says the same before pressing Wipe.

## A photo or video onto an iPhone

The rack pushes a post's file into an Android over USB. A computer cannot
drop a file into an iPhone's Photos.

- **A one-time link.** For a post from an iPhone, Promo makes a link to the
  media library file that works once, within ten minutes. The rack opens it
  in Safari on the phone, saves the file to Photos through the screen, and
  the post steps pick it from Photos.
- **Dead after one download or ten minutes,** whichever is first: a second
  ask, or a late one, answers 410 Gone. The token is 32 random bytes as hex,
  only its hash is stored, and a wrong token answers 404. Nothing is served
  from an open address.
- **On the wire** the link rides under the same `mediaUrl` key the rack
  already reads, with `mediaFromSafari: true` beside it. An Android post is
  unchanged.
- **Where it is kept:** `promo_media_links`, tidied of day-old links each time
  a new one is made.

## Texted codes on an iPhone

iOS gives a computer neither the SMS inbox nor the message's notification.
While the screen window is open with control on, the rack opens Messages on
the iPhone every few seconds and reads the newest code off the screen; it
shows beside the window with who sent it, as on Android. Messages is never
opened during a job, and never with control off. The window says so for an
iPhone, and its Back and Recent apps keys read "Back (swipe)" and "App
switcher (swipe)", since that is how an iPhone does them; the key names on
the wire are unchanged ([the screen window](screen-window.md)).

## What only a real iPhone proves

- That WebDriverAgent finds the apps' buttons and the self-test walks each
  rehearsal to its last button on an iPhone 11 to 13.
- That Safari saves the one-time link's file to Photos and the post steps
  find it there.
- That the rack reads the Apple ID off Settings and the code off Messages.
- That an iPhone's battery, heat and storage arrive over the diagnostics
  channel once a minute.

## Where it is

- Promo: `src/server/phones/self-test.ts` and `action-checks.ts` (per kind),
  `wipe.ts` (iCloud read and refusal), `media-links.ts` and
  `src/routes/api/media-link/$token.ts` (the one-time link), `health.ts`
  (the WebDriverAgent bell), `src/server/social/phone-apps/iphone-inbox.ts`
  (the hourly inbox reads, called from the `promo-phone-health` job in
  `src/app/server-options.ts`), `src/lib/phones/setup-check.ts` (the lines'
  words per kind).
- The windows: `src/components/phones/self-test-dialog.tsx`,
  `phone-settings.tsx` (the two slots), `phone-setup-panel.tsx` (Check
  iCloud), `phone-screen-dialog.tsx`.
- Tables: `drizzle/0121_promo_iphones.sql` (the kind, the test-phone slot,
  the per-kind keys) and `drizzle/0122_promo_iphone_promo_side.sql`
  (`promo_media_links`, `promo_accounts.inbox_asked_at`).
- The rack's side: `rack/promo_rack.py` and `rack/iphone.py`.
