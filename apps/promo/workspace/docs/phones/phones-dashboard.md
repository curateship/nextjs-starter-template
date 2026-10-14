# The Phones dashboard

Every Android phone on the rack, as a record of its own, with the account on
it, its app versions, whether it is connected, its carrier and when the rack
last saw it. On
narrower windows the columns fold so the row's buttons stay on screen: below
1280 pixels the account moves under the phone's name and the carrier goes,
and the last-seen time shows from 1536. It is
at `/admin/phones`, under **Anti Detect** in the left menu, after Proxies.

Tyler chose real phones for the important Reddit, Instagram and TikTok
accounts on 9 Oct 2026, with throwaway accounts staying on browser profiles.
His rule of 5 Oct 2026 holds here: devices are app-wide records with their own
dashboard, never something tucked into one network's settings.

## A phone

- **What a phone holds:** a name, model, Android version, serial number, SIM
  carrier and number, how it goes online, notes, a folder, a label, tags, a
  shelf slot and a USB port.
- **How it goes online:** its own SIM, or the house Wi-Fi. On Wi-Fi it goes
  out through one of the proxies on the Proxies dashboard, and before every job
  the rack checks the address apps see is that proxy's
  ([making each phone look like one person's](looking-like-a-real-person.md)).
  A SIM phone never keeps a proxy, because it goes out over its own line. A
  proxy a browser profile uses is refused.
- **Folders, labels and tags are the browser profiles' own.** One folder can
  hold profiles and phones together, and Folders and labels on the Browser
  profiles dashboard edits both.
- **Plugging a phone in adds it.** A serial the rack has never seen becomes a
  phone named after its model. A phone first seen before USB debugging was
  allowed is called "Phone" and the last four characters of its serial, and
  takes its model's name once the rack can read it.
- **Adding one by hand** works too, with New phone. Typing its serial ties the
  record to the phone when it is plugged in later, instead of a second record
  being made.
- **What the rack fills in:** the model when it is blank, the Android version
  every time, the USB port and when it was last seen. A name or model a person
  typed is kept.

## The status

Worked out from the rows every time the list is read, never stored, so it can
never disagree with what the rack last said.

- **Held:** a person took it out of use, with the pause button on its row or
  Hold on ticked rows, or has control of it in its screen window ("In use on
  its screen" under the word). It wins over everything else. Release puts it
  back. A check cannot be asked of a held phone, holding one cancels the
  checks still waiting for it, and its jobs wait until it is released.
- **Offline:** not seen for 45 seconds, or missing from the rack's last list,
  or waiting for someone to allow USB debugging on its screen, or being
  restarted by the rack after it froze ("Restarting"), or on a rack that was
  disconnected. The line under it says which.
- **Busy:** a check is running on it.
- **Connected:** none of the above.

The rack checks in every 15 seconds and the dashboard reads the list again
every 10 seconds while it is in view, so a phone plugged in or pulled out
shows within a minute without a reload.

## The shelf slot

Tyler types each phone's shelf slot once. The rack reports the USB port on
every check-in, so moving the cable to another port updates the port by
itself. An offline phone shows "slot 4" beside its status, so the right phone
gets picked up first time.

## The bell

A phone offline for five minutes, running hot, with no signal or nearly full,
and the rack not checking in, each ring the bell once and clear when they
end. [A phone's health](phone-health.md) has the rules. Clicking a notice
opens the phone.

## Where an account runs

An account runs on a browser profile or a phone, never both. The database
refuses the two at once (`ck_promo_accounts_one_device`), and one Reddit
account per phone is a unique index, the same rule as profiles.

- **Add account** on the Reddit accounts dashboard has one "Runs on" list of
  profiles and phones with no Reddit account yet.
- **The settings button on an account's row** moves it to another profile or
  phone. Whatever it ran on before is cleared in the same save. Sign-ins do
  not move with it.
- **Settings → Reddit account** has the same list, with Nowhere.
- **Its jobs run on the phone.** [Jobs on phones](phone-jobs.md) explains the
  queue, the limit and the waking hours, and [Reddit on phones](../reddit/reddit-on-phones.md)
  what the Reddit app does there.
- **A phone an account left needs wiping** before another account goes on, and
  a phone that held an important account takes no throwaway until it is wiped.
  The pickers list such a phone with why.

## The window

A phone opens as a window over the list and keeps `?open=<id>` in the address,
which is where its bell notice leads. The screen button on a row opens the
phone's live screen ([the screen window](screen-window.md)). It has five tabs:

- **Settings:** the fields above.
- **Setup:** the setup check, what the platform sees, and wiping the phone.
  [Making each phone look like one person's](looking-like-a-real-person.md).
- **Health:** the last reading (battery, heat, storage, signal), the battery
  and heat chart for four weeks, and each app's version.
  [A phone's health](phone-health.md).
- **Actions:** ask the rack to read the Android version off the phone's own
  Settings screen, or take a health reading, and the last 20 actions with a
  picture of each step ([a picture of every step](step-pictures.md)). A check
  is refused for a held phone, an offline phone, and a rack that has not
  checked in for a minute. [The rack program](rack-program.md) explains both
  checks.
- **History:** everything that happened to the phone, newest first.

## The rows and Self-test

- **Each row lists the phone's app versions** under its name, such as
  "Reddit 2025.40.0", and "Self-test phone" on the test phone.
- **An amber line under the name** says the most urgent setup problem: stopped
  for showing the wrong address, needs wiping, wiped and not set up again, or
  how many setup check lines fail.
- **Mix** in the toolbar counts the phones on each model, carrier and Android
  version, and turns amber when more than half of four or more share one.
- **Self-test** in the toolbar opens the daily self-test's answers and app
  updates: [the self-test and app updates](self-test-and-app-updates.md).

Deleting a phone deletes only the record. Nothing on the phone changes, the
accounts on it run on nothing until another place is picked, and a phone still
plugged in comes back as a new record on the next check-in.

## Where it is

- The page: `src/components/phones/phones-dashboard.tsx`, the window
  `phone-dialog.tsx` with `phone-setup-panel.tsx`, `phone-health-panel.tsx`,
  `phone-actions-panel.tsx` and `phone-history-panel.tsx`, the Rack window
  `rack-dialog.tsx`, the Self-test window `self-test-dialog.tsx` and the Mix
  window `rack-mix-dialog.tsx`.
- The endpoints: `src/lib/api/phones/phones.ts` and `health.ts`. The server:
  `src/server/phones/phones.ts`, with the bell in `src/server/phones/health.ts`.
- The tables: `promo_phones` and `promo_accounts.phone_id`, in
  `src/server/phones/schema.ts` and `drizzle/0114_promo_phones.sql`, which also
  adds the left-menu link to every saved menu that already links to Browser
  profiles.
