# The Plan tab

Settings → Plan (`/settings?tab=plan`) shows a signed-in member their plan,
what they pay next and when, the month's AI credits, the upload space used,
and the way to Stripe's billing page. The account menu's "Plan and billing"
row opens it. Guests never see the tab.

## What each account sees

| Account | Heading | Lines | Buttons |
| --- | --- | --- | --- |
| Free | Free plan | What Pro adds | Get Pro, to `/plans` |
| Pro, paid by card | Pro, paid monthly (or yearly) | "Next payment: $9 on 12 November 2026." | Manage billing, Change plan |
| Pro, set to end | Pro, paid yearly | "Pro ends on 9 October 2027. You won't be charged again." | Manage billing, Change plan |
| Pro on a free trial | Pro, paid monthly | "Your free trial ends on 14 October 2026. Then $9 is charged." | Manage billing, Change plan |
| Pro, card declined | Pro, paid monthly | "Your card was declined. Update it to keep Pro." in red | Manage billing, Change plan |
| Pro an admin granted | Pro | "Given to you by the Flowfly team until …. Nothing is billed." | none |
| Admin with no plan | Pro, as an admin | "Your account reads as Pro because it is an admin account." | none |
| Plan on hold | Pro, paused | "Nothing is billed while it is paused." | Manage billing |

- **Pro and admin accounts also get two more cards.** AI credits this month
  shows "3 of 5 left" for backgrounds and for soundscapes, with any bought
  credits after it ("plus 5 bought") and the day the month's come back. Upload
  space shows "1.2 GB of 2.0 GB used" with a bar, which turns amber at 90%,
  and says when 10 GB bought runs out.
- **Manage billing opens Stripe's billing page.** That is where a member
  updates the card, cancels, or finds receipts. Stripe's "return" link comes
  back to this tab. The button is only there with payments switched on and a
  Stripe customer on the account.
- **Change plan opens `/plans`**, where the monthly and yearly cards are.

## The next payment is Stripe's figure

The amount is Stripe's own preview of the member's next bill
(`invoices.createPreview`), never the plan's price. A discount code, a
proration or tax is already in it.

- **Theo's sandbox account shows why.** His plan is $78 a year, but the tab
  says $147. Stripe agrees: his 9 Oct 2026 switch from monthly to yearly left
  $69 to collect with the next bill. A figure worked out from the price would
  have said $78.
- **Stripe is asked only when a charge is coming**: a plan paid by card,
  active or on a trial, and not set to end.
- **If Stripe can't be reached, the rest of the tab still loads.** The line
  then reads "Stripe could not tell us your next payment just now. Manage
  billing shows it."
- **The date is the renewal day we hold**, or the trial's end on a trial.

## How it works

- `src/lib/api/pomodoro/plan.ts` is the one request, guarded so it only ever
  reads the signed-in member's own plan.
- `src/server/pomodoro/plan-tab.ts` builds the answer. It reads the plan
  through `loadPlanStanding` in `src/server/pomodoro/entitlements.ts`, the one
  module that reads plan rows.
- `src/components/pomodoro/plan-settings-panel.tsx` draws the three cards.
- The tab loads when it is opened, with "Loading your plan…", and a failed
  read shows Try again.
