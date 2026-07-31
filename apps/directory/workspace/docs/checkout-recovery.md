# Abandoned Checkout Recovery

One polite follow-up email for paid product checkouts that were started and never finished.

## Where the abandoned checkouts come from

The Stripe webhook writes a `product_orders` row with `payment_status = 'pending'` when a
checkout session completes without payment (delayed payment methods, or any session-based
checkout that stalls). Nothing read those rows before this feature. The embedded card form on
`/products/{slug}/checkout` only writes a row once payment succeeds, so a card checkout that is
simply closed leaves no trace — those cannot be recovered yet.

## How it works

An hourly cron (`/api/cron/checkout-recovery`, registered in `cron_jobs` by migration 199) finds
pending paid-purchase orders that are:

- at least 24 hours old (`RECOVERY_DELAY_HOURS`) — no nagging someone mid-purchase;
- at most 7 days old (`RECOVERY_MAX_AGE_DAYS`) — no digging up ancient carts on first deploy;
- not already emailed (`recovery_email_sent_at IS NULL` — the send-once guard);
- not followed by a successful order for the same email and product;
- not from an email whose newsletter contact is unsubscribed, bounced, or complained;
- on an active site whose **Checkout Recovery** switch (Site Settings → General) is on.

The decision rules are pure functions in
`src/lib/actions/products/checkout-recovery-core.ts` with unit tests; the cron's SQL only
narrows the candidate set.

One person + one product = one email, however many pending rows their retries left behind. The
stamp is written to every matching pending row, and only after the email provider accepts the
send — a failed send retries next tick, and running the job twice can never email twice.

## The email

An editable transactional template (`abandoned_checkout_recovery`, Admin → Platforms → Emails)
sent through the site's own email integration. Its `{{checkout_url}}` token links to
`/products/{slug}/checkout?tier={tierId}` — the page starts a brand-new Stripe payment, so
nothing expired is ever reused; without a usable tier the link falls back to the product page.
`{{unsubscribe_url}}` is the standard HMAC-tokened `/unsubscribe` link, which marks the
newsletter contact unsubscribed and thereby suppresses any future recovery emails too. Turning
the template off in the editor stops sends, same as the site switch.

## Where the admin sees it

The Orders screen shows a muted "N recovery emails sent" count beside the title and a
"Recovery sent" badge in the Email Status column on each emailed order.
