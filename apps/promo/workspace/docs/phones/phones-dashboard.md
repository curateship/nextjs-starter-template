# The Phones dashboard

Every Android phone on the rack, as a record of its own, with the account on
it, whether it is connected, its carrier and when the rack last saw it. It is
at `/admin/phones`, under **Anti Detect** in the left menu, after Proxies.

Tyler chose real phones for the important Reddit, Instagram and TikTok
accounts on 9 Oct 2026, with throwaway accounts staying on browser profiles.
His rule of 5 Oct 2026 holds here: devices are app-wide records with their own
dashboard, never something tucked into one network's settings.

## A phone

- **What a phone holds:** a name, model, Android version, serial number, SIM
  carrier and number, how it goes online, notes, a folder, a label, tags, a
  shelf slot and a USB port.
- **How it goes online:** its own SIM, or the house Wi-Fi. On Wi-Fi it can go
  out through one of the proxies on the Proxies dashboard. A SIM phone never
  keeps a proxy, because it goes out over its own line.
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
  Hold on ticked rows. It wins over everything else. Release puts it back. A
  check cannot be asked of a held phone, and holding one cancels the checks
  still waiting for it.
- **Offline:** not seen for 45 seconds, or missing from the rack's last list,
  or waiting for someone to allow USB debugging on its screen, or on a rack
  that was disconnected. The line under it says which.
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

A phone that disappears from a rack that is still checking in, or that starts
waiting for USB debugging to be allowed, rings the bell: "Phone needs a hand:
Pixel 8a in slot 4 disappeared from the rack". The detail says the slot and the
USB port it was on. The notice's id is the phone's id, so clicking it opens the
phone, and a phone has one notice that comes back to the top as unread each
time it needs a hand again. A held phone going missing rings nothing.

A whole rack going quiet does not ring the bell yet. Its phones show offline,
and watching the rack itself is file 07 of the phone farm.

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
- **Phones do not take Reddit jobs yet.** That is file 02 of the phone farm.
  Until then a search, comment, reply or post for an account on a phone is
  refused with words saying so, and Post on the Projects dashboard says the
  same. Nothing is ever sent through a browser the account never signed in to.

## The window

A phone opens as a window over the list and keeps `?open=<id>` in the address,
which is where its bell notice leads. **Settings** has the fields above, and
**Checks** asks the rack to read the Android version off the phone's own
Settings screen, or take a health reading, with the last ten answers and any
pictures the phone sent back. A check is refused for a held phone, an offline
phone, and a rack that has not checked in for a minute. Pictures are kept for
each phone's newest 20 checks. [The rack program](rack-program.md) explains
both checks.

Deleting a phone deletes only the record. Nothing on the phone changes, the
accounts on it run on nothing until another place is picked, and a phone still
plugged in comes back as a new record on the next check-in.

## Where it is

- The page: `src/components/phones/phones-dashboard.tsx`, the window
  `phone-dialog.tsx` and `phone-checks-panel.tsx`, the Rack window
  `rack-dialog.tsx`.
- The endpoints: `src/lib/api/phones/phones.ts`. The server:
  `src/server/phones/phones.ts`, with the bell in `src/server/phones/notices.ts`.
- The tables: `promo_phones` and `promo_accounts.phone_id`, in
  `src/server/phones/schema.ts` and `drizzle/0114_promo_phones.sql`, which also
  adds the left-menu link to every saved menu that already links to Browser
  profiles.
