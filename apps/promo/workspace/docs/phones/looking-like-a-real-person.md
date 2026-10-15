# Making each phone look like one real person's

A real phone has nothing faked, but a rack of them can still look like a farm:
the same model on one cell tower, a battery always full, Wi-Fi beside a SIM,
apps allowed the location. These are the checks that close what is left. Parts
23, 26, 27 and 28 of the phone farm; part 22 is
[important and throwaway accounts](../accounts/important-and-throwaway.md).

Nothing here has run on a real phone yet. The rack's screen walks (the Play
Store, the browser, Settings) were written from how those apps are known to
look; the first run on the rack is the proof, and a step that does not find
its button stops with a picture of the screen.

## The setup check

The **Setup** tab in a phone's window on the Phones dashboard. **Check now**
asks the rack to read the phone; it takes a minute or two, and the tab shows
each line passing or failing with why. A line that could not be read says so
rather than guessing.

| Line | Passes when |
| --- | --- |
| Charging stops near 80 | The battery stayed at 85 out of 100 or less over the last day. Read from the battery readings, not a setting, because every maker names that setting differently. |
| Wi-Fi off | A SIM phone has Wi-Fi off. On the house Wi-Fi, apps see the house's address. A Wi-Fi phone passes only with a proxy picked. |
| Never the house's address | The address apps see is not the house's own, read by the rack computer at the same moment; on a Wi-Fi phone it has to be the proxy's, with the proxy tested from the server then too. |
| Location off for the apps | Reddit, Instagram and TikTok, whichever are installed, may not read the location. |
| Clock matches the country | The phone's time zone is in the SIM's country, or the proxy's on a Wi-Fi phone. The rack computer's own time zone table says which country a zone is in. |
| Language matches the country | The language's region (en-CA is Canada) is that same country. |
| Automatic app updates off | The Play Store is set to Don't auto-update apps, read from its Settings, Network preferences, Auto-update apps. The rack taps through to that screen to read it and never taps a choice. New versions then only arrive through Update in the Self-test window ([the self-test](self-test-and-app-updates.md)). |

- **The check passes** when no line fails and two lines were read: Wi-Fi on a
  SIM phone, and the address apps see. Any other line the rack could not read,
  such as a Play Store setting it did not find on one maker's screens, does
  not hold a phone back; the tab says how many could not be read.
- **Each check goes in the phone's history**, with the lines that did not pass.
- **The phone's row** on the Phones dashboard says "Setup check: 2 of 7 lines
  fail" until it passes.

## What the platform sees

Beside the check, built like the browser's "Check what a site sees": the
phone opens an address-echo page (ipinfo.io) in its own browser and reads the
answer off the screen, and the rack computer asks the same page for the
house's own address.

- **Outside address:** matches when a Wi-Fi phone shows its proxy's address,
  with the proxy tested from the server at the same moment;
  wrong whenever it shows the house's. On a SIM phone it is the SIM's, noted.
- **Country:** where apps place the phone, against the SIM's or the proxy's
  country.
- **Carrier:** the SIM's, and whose network the address belongs to.
- **Clock and language:** the phone's, against where its address is.

## Wiping a phone between accounts

A new account never inherits an old one's phone.

- **When an account leaves a phone,** moved to another phone or to a browser
  profile, the phone needs wiping. Its history says so and its row on the
  Phones dashboard says "Needs wiping before another account".
- **No account is set onto it** until it is wiped and set up again. The
  account pickers list it as "needs wiping" or "wiped, set it up again", and
  picking it is refused with what to do.
- **Wipe the phone,** on its Setup tab, asks for a confirmation, then the rack
  walks Settings to a factory reset (Erase all data on a Pixel, Factory data
  reset on a Samsung) and presses it. It is refused while an account runs on
  the phone or is being moved onto it.
- **After the wipe** the phone is held, so it going away does not ring the bell
  as offline, and its history says "Wiped". Setting it up is by hand: USB
  debugging back on, Google, the apps. Then release it and run its setup
  check; it takes an account again once a check after the wipe has passed.
- **A wipe also forgets** that the phone held an important account.
- **The self-test never rehearses a wipe.** The rack's erase is pressed
  through the same last-button guard as Post, which a rehearsal can never
  press.

## The rack mix

**Mix** on the Phones dashboard's toolbar. It counts the phones on each model,
carrier and Android version.

- **It warns when more than half the phones share one,** once the rack has four
  phones or more (Tyler, 14 Oct 2026), such as "3 of 4 phones are a Pixel 8a".
  A rack of two or three never warns.
- **The button turns amber** while there is a warning, and its tooltip says the
  first one.
- **The carrier** is the SIM's own name from the setup check, or the one typed
  on the phone; a Wi-Fi phone counts as "Wi-Fi through" its proxy. Carriers
  are compared without case.
- **A value not read yet,** such as a blank model, is counted but never warned
  about.

## Phones on Wi-Fi with a proxy

The middle tier between throwaways on browser profiles and SIM phones: a phone
on the house Wi-Fi going out through a static residential proxy, forced by a
VPN-style proxy app on the phone.

- **Picked in the phone's settings:** How it goes online, The house Wi-Fi, then
  the proxy. A proxy used by a browser profile is refused
  ([important and throwaway](../accounts/important-and-throwaway.md)).
- **Before every job on it,** the rack reads the address apps see on the phone,
  and Promo tests the proxy from the server at the same moment.
- **The house's address, or any address that is not the proxy's,** refuses the
  job and stops the phone: every later job is refused too, and the bell rings
  "Wrong address showing: Pixel 8a in slot 4" with what was seen. The phone's
  Setup tab and its row say so.
- **An address that could not be read,** or a proxy that did not answer its own
  test, refuses that job only. A refusal is final, so a comment is never tried
  twice.
- **The stop lifts** once a setup check finds the proxy's address again, or the
  phone is switched to its own SIM, and the notice goes.
- **A Wi-Fi phone with no proxy** has every job refused, since apps would see the
  house's address.

## Where it is

- The lines: `src/lib/phones/setup-check.ts`. The rack mix: `src/lib/phones/rack-mix.ts`.
- Saving a check and the address guard: `src/server/phones/setup.ts`, the guard
  called from `src/server/social/runner.ts` before a phone job.
- Wiping and the needs-wiping rule: `src/server/phones/wipe.ts`, called from
  `src/server/social/accounts.ts`.
- The columns on `promo_phones` (`needs_wipe_at`, `wiped_at`, `held_important_at`,
  `setup_check`, `address_stop_at`) are from `drizzle/0117_promo_phone_identity.sql`.
- The tab: `src/components/phones/phone-setup-panel.tsx`; the Mix window:
  `src/components/phones/rack-mix-dialog.tsx`.
- On the rack computer, in `rack/promo_rack.py`: `action_setup_check`,
  `action_outside_address` and `action_wipe`. The saved screens its tests read
  are in `rack/fixtures/setup/`, written by hand from the apps' known layout.
