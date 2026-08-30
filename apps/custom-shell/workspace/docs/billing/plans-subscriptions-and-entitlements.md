# Plans, subscriptions, and entitlements

Plans define what an account receives. A plan can set:

- Price and billing interval.
- Stripe price id.
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

The repo's `docs/shell/saas-foundation.md` contains the full billing contract,
including required environment values and the provider test path.
