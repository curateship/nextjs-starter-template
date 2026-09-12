# Plans, subscriptions, and entitlements

Plans define what an account receives. A plan can set:

- Price and billing interval.
- Stripe price id.
- An optional Stripe meter event name for pay-per-unit plans.
- Customer-facing feature list.
- Account and storage limits.
- AI allowance.

The Plans dashboard can create, edit, order, archive, and restore plans. The
public Pricing page only shows plans meant for customers.

A subscription belongs to a user and records:

- The plan and status.
- Billing dates and any trial.
- Provider ids and cancellation details.

The billing server turns that record into entitlements, the concrete limits and
permissions that product code checks. Product code should ask for an entitlement
rather than compare plan names.

## Stripe

Stripe settings hold:

- The publishable key.
- The secret key.
- The webhook secret.
- The operating mode.

Checkout creates or reuses a Stripe customer and starts the selected price. The
customer portal remains available for payment methods and subscription changes
that need Stripe's own controls.

## Changing plans inside the app

Members with an existing Stripe subscription can choose another paid tier or
billing period in Account → Billing or on Pricing. The app shows a confirmation
inside the page. Billing already sits inside the account dialog, so the preview
does not open another dialog.

The preview names the new recurring price before tax and discounts. It shows
the charge or credit for the unused part of the period separately from the
invoice estimate. Stripe supplies those amounts. The server uses
`create_prorations` for both preview and confirmation, with the same
`proration_date` so time spent reading the preview does not change the quoted
proration.

- Changing tiers within the same billing period keeps the renewal date. Stripe
  puts the adjustment on the next invoice by default.
- Changing from monthly to yearly or back starts a new billing period and can
  require payment today. The preview says when the estimate is for today.
- A downgrade takes effect immediately after Stripe confirms the change. Its
  credit reduces bills and does not issue a cash refund.
- An existing trial keeps its original end date. Changing tiers does not start
  another trial.
- Returning to Free uses the existing Cancel my plan action. Free is not a
  second Stripe price to buy.

The app supports one fixed-price subscription item in the same currency. It
preserves the item's quantity. Metered plans, multiple items, invoice-based
collection, pending subscription updates and Stripe schedules need the portal.
Paused or ending subscriptions must first resolve their pause or cancellation.
An outstanding invoice must be settled before switching to avoid crediting time
that was never paid for.

Both endpoints require the signed-in member and the normal request-origin
checks. The browser names a plan and billing period, never a Stripe price or
customer. The server decides whether to preview an existing subscription or
start checkout. Checkout also checks Stripe for an existing subscription before
creating another one, including when the local record has fallen behind.

Previews expire after five minutes. Each preview is signed with the active
Stripe secret key and belongs to one member, subscription and target price.
Changing Stripe mode or keys invalidates an old preview. Confirmation checks
Stripe's current subscription and recalculates the invoice before applying the
change. A changed subscription or amount requires a fresh preview. In-app
confirmations run one at a time per subscription, and retries use the same
Stripe request identifier.

If immediate payment fails, `error_if_incomplete` leaves the Stripe subscription
unchanged. The member can update their payment method or complete authentication
through Manage in Stripe. A connection failure asks the member to refresh
Billing before trying again because Stripe may already have accepted the change.

The existing subscription webhook remains the only writer of the new plan and
entitlements. The confirmation checks for that new plan for about 15 seconds,
then refreshes the page and shell badge. A delayed webhook leaves a Check status
button that reads the account again without submitting another plan change.

Stripe's [preview API](https://docs.stripe.com/api/invoices/create_preview) and
[subscription update API](https://docs.stripe.com/api/subscriptions/update)
define the proration and payment behavior. The implementation lives in
`src/server/billing/plan-change.ts`, the guarded endpoints in
`src/lib/api/billing/billing.ts`, and the confirmation in
`src/components/shared/plan-change-confirmation.tsx`.

### Testing the plan switch

1. On `http://localhost:3002`, configure sandbox keys in Settings → Payments and
   select sandbox mode. Enable local billing with
   `CUSTOM_SHELL_BILLING_ENABLED=true`. The running app must have loaded that
   setting. Use test prices for two public, active paid tiers in the same
   currency and a test subscription with a paid invoice.
2. Deliver signed Stripe test webhooks to `/api/webhooks/stripe`. Include
   `customer.subscription.updated` and use the matching test webhook secret.
3. Open Account → Billing, choose the more expensive tier, and read the preview.
   Cancel once and confirm that Stripe's subscription has not changed. Reopen
   the preview and confirm the change.
4. Check that Stripe kept the subscription id and quantity but changed its
   price. Compare the proration invoice lines with the preview. Once the webhook
   arrives, check the plan badge, Billing history and a feature or limit that
   differs between the tiers. Reload and confirm the new access remains.
5. Choose the cheaper paid tier. Check the unused-time credit and confirm the
   lower plan's access after the webhook. Check that the credit reduces a bill
   rather than producing a cash refund.
6. Repeat from Pricing and switch monthly to yearly, then yearly to monthly.
   Compare the payment-today estimate and new billing date with Stripe.
7. Leave a preview open for more than five minutes, then confirm. Repeat after
   changing the subscription in Stripe's portal. Both previews must be refused
   with an instruction to choose the plan again.
8. Test a declined payment on a change that bills immediately. The plan and
   access must remain unchanged. Delay webhook delivery after an accepted
   change and verify Check status does not submit another change.

The focused automated checks are
`npm run test -- src/server/billing/plan-change.test.ts src/components/shared/plan-change-confirmation.test.tsx src/server/guards.test.ts`.
The server tests use an isolated database and Stripe test doubles. They prove
request behavior and webhook handling, not a live Stripe transaction.

## Metered billing and webhooks

A plan with a meter event name uses a Stripe metered price. Product code records
whole positive units through `recordUsage(userId, meter, quantity)` after the
measured work succeeds. The meter argument must exactly match the event name on
the member's plan. Other meters still appear in the local usage totals but are
not sent to Stripe. The Stripe meter must keep its default payload keys:
`stripe_customer_id` for the customer and `value` for the whole-unit quantity.

The app saves each usage event before it contacts Stripe. A failed Stripe call
leaves the event waiting for another attempt. An invoice webhook retries the
waiting events for that Stripe customer one at a time. Stripe refuses events
older than 35 days, so the admin usage page calls those out as failed instead of
retrying forever.

Subscribe the Stripe webhook to `invoice.created` as well as the subscription
events. That early invoice event is the recovery point for waiting meter events;
the endpoint returns an error while more rows remain so Stripe delivers it
again.

The referral program also needs `invoice.payment_succeeded` and
`charge.refunded`. The first event records a referred member's first real
subscription payment. The second takes back a pending or granted reward after a
full refund. [Referral program](referral-program.md) explains the attribution
and free-month rules.

The Stripe webhook verifies its signature before updating subscriptions,
billing events, and subscription history. Repeated webhook deliveries must not
apply the same change twice. An admin can inspect billing and subscription
events when provider state and local state need comparing.

## Account and admin views

Members can see their current plan and subscription in Account. Admins can see
plans and billing state across the platform. Account changes that affect access
take effect through entitlements, so navigation and server permissions reach the
same answer.

The member's Billing tab includes their plan history, newest first. The list
shows trials, subscriptions, plan switches, payment failures and recoveries,
cancellations, pauses, resumptions, and plans added or removed by an admin. It
does not name the admin or expose an event kind until that kind has approved
member wording.

Billing history starts on August 3, 2026. The tab always says when recording
started because older plan changes were not reconstructed. The list shows at
most the latest 50 changes and says when older changes may exist.

The billing-page request takes no account id from the browser. It reads history
only for the signed-in user. Each returned history item contains its approved
event kind, plan names, any date needed by the wording, and when it happened.
Raw provider status and who caused the change never reach the browser.

The same Billing tab shows the signed-in member's total units, totals by meter,
and recent usage. The admin usage page at `/admin/ai-usage` shows this month's
platform totals, totals by meter and member, and Stripe reports from any month
that still need attention. Admins can open it from the Dashboard group's
top-left menu or the Plans dashboard. The navigation upgrade moves any saved
copy of the link into that group and changes an absolute address to the internal
route, so the shell recognizes the group on the Metered usage page.

Stripe decides how a meter adds or prices its units. Tier rules and unit names
are configured in Stripe rather than copied into this app. A shell plan supports
one Stripe meter event name in this first version.

The repo's `docs/shell/saas-foundation.md` contains the full billing contract,
including required environment values and the provider test path.
