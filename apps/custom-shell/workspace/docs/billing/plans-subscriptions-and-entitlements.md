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
customer portal handles payment methods and provider-managed subscription
changes.

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
