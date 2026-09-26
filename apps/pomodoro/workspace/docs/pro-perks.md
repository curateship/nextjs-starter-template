# Pro perks

What a paid plan unlocks: hosting focus rooms, premium sounds and scenes,
uploading your own media, history beyond two weeks, and AI credits, plus the
numeric allowances (2GB storage, 5 backgrounds and 20 soundscapes a month on
the old app's Pro).

## How gating works

- **Billing stays the shell's.** Plans, checkout, the customer portal and
  the webhooks are untouched; the app never reads plan or subscription rows
  itself.
- **One module answers every can-do question:**
  `src/server/pomodoro/entitlements.ts`. Endpoints gate with
  `requirePomodoroPerk(userId, perk)`, which throws
  `UPGRADE_REQUIRED:<perk>`; screens read `loadMyEntitlements()` from
  `src/lib/api/pomodoro/entitlements.ts` to lock controls.
- **The rule per perk:** an explicit value in the plan's feature record wins
  (a perk can be gifted on a free plan or withheld from a paid one), and a
  missing key falls back to the old contract — paid unlocks everything,
  free nothing. A paused plan counts as free. Unit tests:
  `src/server/pomodoro/entitlements.test.ts`.
- **An admin reads as paid, whatever their plan.** An operator of the
  deployment is not a customer of it, so they are never asked to buy their
  own product to host a room or upload a background. Nothing else about them
  changes: their plan's feature record still applies on top, so a plan
  handing out 100 monthly backgrounds still hands the admin 100, and a plan
  that deliberately switches a perk off still switches it off. Being an admin
  answers "have they paid", not "what did they buy". Tyler asked for this on
  25 Sep 2026.
- **Feature keys** an admin can set on a plan (Settings → Plans):
  `hostRooms`, `premiumMedia`, `uploadMedia`, `longRangeReports`,
  `aiCredits`, `storageLimitBytes`, `monthlyBackgrounds`,
  `monthlySoundscapes`.
- **Locked controls always say why** — the sentences live with the perk
  list in `src/lib/pomodoro/pro.ts`, used with the shell's disabled-reason
  pattern by the screens that consume them.

## Prices

Not set. The old app charged free / $9 a month / $78 a year ("Save 28%"),
kept here for reference; live prices wait for Tyler and are entered in the
shell's Plans screen, not in code.
