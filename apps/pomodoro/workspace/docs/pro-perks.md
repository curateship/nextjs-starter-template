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
  `monthlySoundscapes`, and `sharedMedia`.
- **`sharedMedia` is on for every plan, free included.** It lets a member
  play, add and save files other members share (uploads-and-sharing task 03,
  part 10). Unlike the Pro perks, a plan that says nothing has it, so a plan
  only loses it by setting `sharedMedia: false`. The Free card on `/plans`
  lists it while it is on. See [Shared sounds and backgrounds](shared-media.md).
- **A Pro host's sound and theme play for everyone in the room.** The Pro
  check happens when the host saves the room's pair, so a free member hears
  and sees it while in the room. Their own personal room stays locked.
- **Locked controls always say why** — the sentences live with the perk
  list in `src/lib/pomodoro/pro.ts`, used with the shell's disabled-reason
  pattern by the screens that consume them.

## Prices

Free, $9 a month, or $78 a year, which the yearly card draws as $6.50 a month
and "save 28%". Tyler chose them on 9 Oct 2026, the same as the old app, with
no free trial. They are entered in the shell's Plans screen, not in code, and
so far only on the ws-18 row against Stripe's test mode (product
`prod_VPT9NSUmbDznwr` in the "System Everything" sandbox). Pro is not on sale
until the live step in [Switching payments on](switching-payments-on.md) is
done; the date goes here when it is. What a member sees is
[the plans page](plans-page.md) at `/plans`, which reads those rows. The
order to switch payments on, and why the Pro row's feature keys wait for its
Stripe price ids, is in [Switching payments on](switching-payments-on.md).

## Buying more

Two one-off purchases for Pro members (uploads-and-sharing task 07), at the
prices Tyler set on 10 Oct 2026:

| What | Price | Lasts |
| --- | ---: | --- |
| 5 AI backgrounds | $5 | Until spent |
| 20 AI soundscapes | $3 | Until spent |
| 10 GB more space | $5 | 12 months |

- **What each buys** is in [AI backgrounds and soundscapes](ai-generation.md),
  "Bought credits", and [Your own backgrounds and sounds](own-media-uploads.md),
  "10 GB more for a year".
- **The prices are written in code**, in `PURCHASES` in
  `src/lib/pomodoro/purchases.ts`, unlike Pro's, which live on its plan row.
  The server reads the amount from that list and never from the browser, so a
  tampered request cannot buy a pack at another price. Changing a price is a
  code change and a deploy.
- **Space is sold once, not monthly.** Tyler chose this over a monthly add-on
  because the shell keeps one Stripe subscription per member: its webhook
  writes that one row (`writeSubscription` in `src/server/billing/stripe.ts`),
  so a second subscription for space would have overwritten the member's Pro.
- **Only for what the plan allows.** A credit pack needs a plan that allows
  that kind of AI, and space needs uploading; anyone else is refused with
  "Buying more is for Pro members."

### How a purchase goes through

This is the app's own checkout, beside the shell's, in
`src/server/pomodoro/purchases.ts`.

- **Buy writes a row first**, `pomodoro_purchases` (migration 0146), then
  asks Stripe for a Checkout page in payment mode, with the price from the
  list and Stripe's tax code `txcd_10103001` on the product, the same as the
  Pro product, because the live Pomoder account's Managed Payments refuses a
  product without one. The member's Stripe customer is used when they have
  one.
- **Stripe sends the member back to the tab they bought from**, with
  `?purchase=<session>`. The page asks the server to confirm that session,
  which reads it from Stripe, checks it is this member's own, and marks the
  row paid. Only a pending row turns paid, so a reload or the worker landing
  at the same moment records one purchase. A toast says what was bought:
  "5 AI backgrounds added. They never run out at the end of a month."
- **Nobody came back?** The `pomodoro-purchases` worker asks Stripe about any
  session still pending after a minute, every minute for its first 25 hours
  and hourly after that. It marks one expired only when Stripe says the
  checkout expired, never on a timer, because a bank-debit payment can still
  be on its way after a day.
- **A refund made in Stripe takes the purchase back.** The same worker asks
  Stripe about each paid purchase at most once an hour, for a little over a
  year, and a fully refunded one is marked refunded: unspent credits go and
  bought space stops counting. Credits already used from a refunded pack are
  forgiven, so a pack bought afterwards starts full rather than paying them
  back. A partial refund leaves the purchase as it is, and so does a lost
  chargeback for now.
- **Only purchases in the site's current Stripe mode count** (migration
  0149, `livemode`). A test-card purchase made while the site runs on sandbox
  keys stops counting once live keys are switched on.
  At most five Stripe calls a worker pass.
- **The shell's webhook leaves these alone.** It receives the same Stripe
  events, but a payment-mode session has no subscription, so
  `applyStripeEvent` only records the event id, and the referral handler acts
  only on invoice payments and their refunds, which these are not.
- **Payments switched off** hides every Buy button, the same switch as Pro
  (`CUSTOM_SHELL_BILLING_ENABLED`).

### What the test run on 10 Oct 2026 showed

On the ws-18 server against the System Everything sandbox, as seed member
Daniel Okafor, with Stripe's 4242 test card in a real browser:

- With the month's backgrounds used, the generator read "You have used this
  month's AI generations. You get a fresh batch on the first, or buy more
  now." with "Buy 5 more for $5". Stripe's page read "Pomoder: 5 AI
  backgrounds, $5.00". Back on My uploads the toast said the 5 were added and
  the counter read "None left this month, 5 bought left".
- With the space over a lapsed year, the card read "2.1 GB of 2.0 GB" and
  the lapse sentence, with "Get 10 GB more for $5". After paying it read
  "2.1 GB of 12 GB, 10 GB bought until 10 October 2027".
- Refunding the $5 pack in the sandbox, the running server's worker marked it
  refunded within 15 seconds of its next check.
- Not run: a real purchase on the live Pomoder account. Tyler does that.
