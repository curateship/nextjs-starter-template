# Switching payments on

Pro is not on sale yet. Every paid button on `/plans` reads "Coming soon"
until three things exist: Stripe keys in Settings → Payments, Stripe price ids
on the Pro row in Settings → Plans, and `CUSTOM_SHELL_BILLING_ENABLED=true` on
the server. Nothing about prices is written in code; this page says what the
app does once those three are in place and how to prove it. The task behind it
is `workspace/tasks/payments/01-switch-payments-on.md`.

## What was true on 9 Oct 2026

- **No Stripe key anywhere.** The settings row is empty, the env files carry
  none, and the live Pomoder Web app on Coolify has no Stripe or billing
  variable.
- **The prices are Tyler's choice of 9 Oct 2026:** $9 a month, $78 a year,
  no trial. The Stripe account is the "System Everything" sandbox
  (`acct_1TL4p7DqTsa9DIWm`), product `prod_VPT9NSUmbDznwr`, prices
  `price_1UOeDLDqTsa9DIWmWACzoek4` (monthly) and
  `price_1UOeDMDqTsa9DIWmcITQPPOP` (yearly), made with the Stripe CLI. The
  Pro row on the ws-18 database carries them, the badge and the feature keys;
  Team, Scale and Pro (2024) are still the shell's seed rows.
- **The Pro row cannot be saved until it has a price id.** The shell refuses
  to save a public paid plan with no Stripe price
  (`PLAN_STRIPE_PRICE_REQUIRED` in `src/server/billing/plans.ts:233`), so on
  the live site the feature keys and the Highlight badge go in with the price
  ids in one save, not before. Only one plan may hold the badge, so Free's
  "Most Popular" has to be cleared first.

## The order to do it in

1. Run `stripe login` once (the Stripe CLI was installed on 9 Oct 2026), then
   `stripe listen --forward-to localhost:3017/api/webhooks/stripe`. It prints
   the webhook secret for the next step. Without it a purchase still unlocks
   Pro, because the return page asks Stripe itself, but renewals, failed
   cards, plan switches and the end of a cancelled period only arrive by
   webhook.
2. In Stripe's test mode make the Pro product with a monthly and a yearly
   price. Paste the test secret key, publishable key and the webhook secret
   into Settings → Payments under "Sandbox credentials" and switch on "Use
   sandbox keys". Settings → Payments can only store a key when the server
   has `CUSTOM_SHELL_SECRET_ENCRYPTION_KEY`; without it the screen says so and
   saves nothing. Pick that value once and keep it, because changing it makes
   every saved key unreadable.
3. In Settings → Plans open Pro and in one save set: both Stripe price ids,
   the Highlight badge, the free trial days, and the Features JSON below.
   Switch Team and Scale off "Show on the pricing page" unless they are meant
   to be seen on the shell's `/pricing`.
4. Add `CUSTOM_SHELL_BILLING_ENABLED=true` to `.env.local` and restart the
   dev server. `/plans` now reads "Get Pro".
5. Run the money paths below with Stripe's test cards.
6. On the live site repeat steps 2 to 4 with a Stripe test-mode webhook
   endpoint pointed at `https://pomoder.com/api/webhooks/stripe`, then swap in
   the live keys, switch "Use sandbox keys" off, and make one real purchase
   and refund.

The Features JSON for Pro, every key set on purpose so nothing leans on the
"paid unlocks everything" fallback described in [Pro perks](pro-perks.md):

```json
{ "support": "priority", "hostRooms": true, "premiumMedia": true,
  "uploadMedia": true, "longRangeReports": true, "aiCredits": true,
  "storageLimitBytes": 2147483648, "monthlyBackgrounds": 5,
  "monthlySoundscapes": 20 }
```

Those numbers are 2 GB of uploads, 5 AI backgrounds and 20 AI soundscapes a
month, the old app's Pro. The "AI allowance ($ a month)" field on the same form
is the shell's own key and means nothing to this app.

## What each money path does

All of it is the shell's code; the app only reads the result through
`src/server/pomodoro/entitlements.ts`.

- **Buying.** "Get Pro" opens Stripe Checkout
  (`src/server/billing/stripe.ts`, `createCheckoutSession`). Stripe sends the
  person back to `/plans?welcome=pro` (the app's `billing.returnPaths`),
  which asks Stripe about that session on arrival (`confirmCheckout`, added
  9 Oct 2026) and writes the subscription row itself, then refreshes briefly
  in case the webhook has more to say. So Pro unlocks on return even when the
  webhook is late or never reaches the server. Backing out lands on `/plans`
  too. A visitor who is not signed in is sent to `/register` carrying the
  plan and period first.
- **Switching monthly to yearly.** The yearly card reads "Switch to yearly"
  for a monthly subscriber and shows the shell's change-of-plan confirmation
  with the prorated amount (`src/server/billing/plan-change.ts`).
- **Renewing.** Stripe's subscription-updated event moves
  `current_period_end` forward. A renewal writes no history line, because
  nothing about the plan changed.
- **A failed renewal.** The subscription goes `past_due`, which still counts
  as paid (`src/server/billing/entitlements.ts:14`), so Pro stays on while
  Stripe retries the card. The `invoice.payment_failed` event starts a billing
  flow once per invoice, not once per retry. Notices to the member are task
  02.
- **Cancelling at the end of the period.** The member or an admin stops the
  renewal; Pro stays until the period ends, then Stripe's
  subscription-deleted event sets the status to `canceled` and the account
  drops to Free. If the webhook never arrives, Pro still lapses on its own
  when `current_period_end` passes.
- **A refund is two actions in Stripe.** The webhook does not listen for
  refund events, so refunding a payment leaves Pro switched on. Refund the
  payment, then cancel the subscription.
- **The free trial is one per person.** `trialDaysFor` in
  `src/server/billing/stripe.ts` gives the plan's trial only to someone who
  has never had one; the date is written when Stripe confirms the trial
  started, not when the button was pressed.

## What the test run on 9 Oct 2026 showed

Run on the ws-18 server with `stripe listen` forwarding, two seed members as
the buyers, and the Stripe sandbox open beside it.

- **Buying monthly, card 4242.** Stripe charged $9, eight webhook events
  answered 200, the row read active monthly on Pro within a second, and
  the plans page read "Current plan". The first run came back to
  `localhost:3002`, the shell's default, because `CUSTOM_SHELL_APP_URL` was
  not set locally; set now, the return page reads "You are on Pro".
- **Switching monthly to yearly.** The first run found two shell bugs: the
  card said "Pay $147 and switch" while Stripe charged nothing that day and
  parked the $69 of prorations for the next renewal, and the history wrote no
  line for the switch. Both were fixed the same day in custom-shell and copied
  here. A switch between periods now starts a new paid period today
  (`billing_cycle_anchor: "now"` with `always_invoice` in
  `src/server/billing/plan-change.ts`), so the card read "Unused-time credit
  $9", "Estimated payment today $69" and "Pay $69 and switch", Stripe's
  invoice that minute was $78 less $9, paid, with nothing left pending, the
  renewal moved a year out, and the billing dialog read "You switched from
  Pro monthly to Pro yearly." A switch that keeps the period still folds the
  difference into the next bill, as before.
- **Renewing, on a test clock.** Stripe took $9 on the renewal day, the row's
  period end moved a month, and the history stayed quiet, as designed.
- **A failed renewal.** With a card that declines, Stripe set the subscription
  past due. The row read past due, the history got "payment_failed", and the
  plans page still read "Current plan", so Pro stayed on. Paying the open
  invoice with a working card brought "payment_recovered".
- **Cancelling at the end of the period.** The member pressed "Cancel my
  plan" twice through the survey; the dialog then read "Your plan ends on
  Jan 9, 2027. You keep everything until then.", the row carried the end
  date, the survey row was saved, and Stripe agreed. Advancing the clock past
  that date made Stripe cancel it, and the row read canceled, which is Free.
  There is no path to that dialog from inside Pomoder yet; the test used
  `/account?account=billing`. Task 04 builds the Plan tab.
- **Coming back to Pomoder (task 03, same day).** A fourth member backed out
  of Stripe's page and landed on `/plans`; paid with the test card and landed
  on `/plans?welcome=pro` with "You're on Pro…" under the headline and the
  monthly card reading "Current plan"; and the Stripe portal's return link
  pointed at `/plans`.
- **What a new Pro member gets.** The Sounds and Backgrounds pages read
  "0 B of 2.0 GB", "20 of 20 left this month" and "5 of 5 left this month",
  the plan's own numbers.
- **A refund.** Refunding the first $9 in Stripe left the member on Pro, and
  the webhook recorded the refund events without acting on them. A refund is
  two actions in Stripe, as the section above says.

## How to prove it

Each path with the Stripe dashboard open beside the browser, through the
`validate-app` skill:

- Buy monthly with card 4242 4242 4242 4242; Pro unlocks within a few seconds
  on `/account/billing/success` and the Rooms page lets you host.
- Switch to yearly from `/plans`; the confirmation names the prorated amount.
- Renew with a Stripe test clock advanced one period; the billing page shows
  the new period end.
- Fail a renewal with card 4000 0000 0000 0341 on the test clock; Pro stays on
  and the subscription reads past due.
- Cancel at the end of the period, advance the test clock past it; the
  account reads Free.
- Refund the first payment in Stripe; Pro is still on, which is the point of
  the two-action rule above.
- A new Pro member's uploads stop at 2 GB and AI generation at 5 backgrounds
  and 20 soundscapes in the month.

The prices and the date Pro went on sale go into [Pro perks](pro-perks.md)
under Prices once the live purchase has gone through.
