# A phone's health

What keeps the rack working without Tyler watching it: the bell when a phone
or the rack is in trouble, each phone's battery and heat over four weeks, and
everything that happened to a phone in one list. Parts 14, 18 and 19 of the
phone farm.

## What the rack reads

- **Once a minute, per phone:** battery level, battery heat, how full its
  storage is, the SIM's service, and how long since it started. One adb call
  each, on a thread of its own in [the rack program](rack-program.md), so a
  slow phone never holds up a check-in.
- **Every ten minutes:** the version of Reddit, Instagram and TikTok on it.
  An app that is not installed is left out.
- **Sent with the next check-in.** A reading Promo did not receive waits for
  the one after. The newest figures sit on the phone's row; the dashboard's
  window shows them on its Health tab.
- **The SIM's service** is Android's own word for it: in service, out of
  service, emergency calls only, or radio off. A phone with two SIM slots
  counts as having a signal when either slot does. An iPhone gives the rack
  none, and reads "Not reported", never a guess; its battery, heat, storage
  and uptime arrive over Apple's diagnostics channel into the same reading
  ([iPhones on the rack](iphones.md)).

## The bell

One notice per phone per problem. Each is raised once when the problem starts
and taken out of the bell when it ends. A sweep looks every 15 seconds, and a
problem that lasts an hour still leaves one notice that stays where it was,
not one per sweep.

| Problem | When it rings | When it clears |
| --- | --- | --- |
| Phone offline | Offline for more than five minutes. A phone waiting for someone to allow USB debugging rings at once, because nothing changes until a person taps it. | Seen again, connected. |
| Phone running hot | Battery above 45°C. | Battery back down to 43°C, two degrees under, so a phone sitting at 45 does not ring and clear over and over. |
| Phone has no signal | A SIM phone with no service for ten minutes. A phone on Wi-Fi never rings. | Service again. |
| Phone storage nearly full | More than 90 out of 100 full. | 90 or less. |
| Rack not checking in | The rack itself silent for five minutes. Once for the rack, not once per phone. | It checks in. |
| WebDriverAgent on the rack | Within a day of the rack's WebDriverAgent signature running out ("runs out tomorrow; re-sign it in Xcode"), and once more once it has ("has run out; its iPhones are offline until it is re-signed"). Each rings once. The detail says to run `bash ~/Library/Application Support/PromoRack/wda.sh` on the rack Mac. | A check-in reports a later date. |

- **The heading names the shelf slot,** such as "Phone offline: Pixel 8a in
  slot 4", so the right phone is picked up first time. A phone with no slot
  typed says so in the detail.
- **Clicking it opens the phone** on the Phones dashboard (or the dashboard,
  for the rack).
- **A held phone never rings for being offline.** Someone took it out of use,
  usually to unplug it. Nor does a phone on a rack someone disconnected, and
  disconnecting the rack takes its own "not checking in" notice away.
- **An offline phone's last reading never raises a notice.** A phone that lost
  signal and was then unplugged rings "Phone offline", not "no signal" as
  well. Its old reading can still clear a notice.
- **Deleting a phone** takes its notices out of the bell.
- **While the rack is silent its phones are left as they are.** Nothing new is
  known about them, and the rack's own notice covers them.
- **Pulling a phone out no longer rings at once.** Before 14 Oct 2026 a
  missing phone rang "Phone needs a hand: ... disappeared from the rack" the
  moment it went; it now waits the five minutes, so a cable reseated or a
  restart does not ring.

## Battery and heat chart

The Health tab in a phone's window, from the shared chart pieces
(`src/components/ui/chart.tsx`).

- **A point every ten minutes, for four weeks.** Older points are deleted
  once an hour.
- **Every reading at 45°C or more is kept as well,** between the ten-minute
  points, so a spike that lasted three minutes shows at the time it happened.
  The ten-minute rhythm is kept by the ordinary points only.
- **Two lines:** battery out of 100 on the left scale, heat in degrees on the
  right, with a dashed line at 45°C where the bell rings. A key above the
  chart says which is which.
- **Above it, "Now"** shows the last reading in words: battery, heat (with
  "too hot" written beside it over 45), storage used and the signal, and how
  long ago it was read. Below it, each app's version.

## History

The History tab in a phone's window, newest first, built like a browser
profile's history. One line per event:

- **Plugged in** and **Unplugged**, with the USB port.
- **Restarted,** with why: the rack restarted it because it stopped
  answering, an app froze and the rack reopened it, or "Nobody in Promo asked
  it to" when the phone restarted by itself or by hand. A restart is told by
  the time since it started being smaller than at the last reading.
- **App updated,** such as "Reddit went from 2025.39.0 to 2025.40.0". Only a
  change between two known versions counts; a first reading or a new install
  does not.
- **Account moved** onto or off it, and **Account signed in** when the phone
  reads its Reddit account signed in after it was not.
- **Ran hot,** with the heat it reached, and **Notice raised** and **Notice
  cleared** for the other problems above.
- **Wiped,** and each **Setup check** with the lines that did not pass
  ([making each phone look like one person's](looking-like-a-real-person.md)).

## Where it is

- The bell and the readings: `src/server/phones/health.ts`, raised and
  cleared through `src/server/phones/notices.ts`, swept by the
  `promo-phone-health` job in `src/app/server-options.ts`
  (`src/server/phones/upkeep.ts` tidies once an hour).
- The history: `src/server/phones/history.ts`, `promo_phone_events`.
- The chart's points: `promo_phone_readings`. The last reading:
  columns on `promo_phones`. All from `drizzle/0116_promo_phone_health.sql`.
- The tabs: `src/components/phones/phone-health-panel.tsx` and
  `phone-history-panel.tsx`. The notice kinds and their icons:
  `src/lib/social/notice-words.ts` and `src/lib/social/notices.ts`.
- On the rack computer: `vitals_loop` and `parse_vitals` in
  `rack/promo_rack.py`.
