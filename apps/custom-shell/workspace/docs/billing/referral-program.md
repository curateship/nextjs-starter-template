# Referral program

Every account has one permanent referral code. The member Home page turns that
code into a link shaped like `/register?ref=<code>`, gives the member a copy
button, and shows the latest 20 referrals without exposing the invited person's
name or email.

The registration page carries the code through password registration and the
Google sign-in trip. An unknown code, an inactive referrer, or a code owned by
the email being registered stops registration and explains the problem. The app
does not attach a referral to an existing account after the fact. An existing
Google user who arrives through an invite still signs in normally, including
through their own or an expired invite.

## Referral progress

One row in `referrals` records the relationship and its reward history:

- `invited` means a password account was created but its email is not verified.
- `joined` means the new member verified their email. Google registration starts
  here because Google has already verified the address.
- `converted` means Stripe reported the member's first non-zero subscription
  payment.

Only the first qualifying invoice can change `not_earned` to `pending`, so a
renewal or repeated webhook delivery cannot create another reward. Free trials,
zero-dollar invoices, and non-subscription invoices do not count.

The row keeps name and email snapshots. If either account is deleted, its user
reference becomes null while the referral and reward record remain available to
administrators. The member view is always limited by the signed-in referrer's
user id. Created, joined, converted, granted, and revoked timestamps form the
referral's audit history and appear as a timeline in the admin activity row.

## Free-month reward

A conversion creates a pending reward. The Referrals page at `/admin/referrals`
shows the platform totals, both people involved, the current progress, and the
reward state. Administrators can open the page from Plans and add the free month
from a waiting reward's row.

"Add free month" asks first, because the credit cannot be taken back from that
screen. The question names the referrer and the amount, such as "Add a free
month ($20) to Sam's next bill?". The page works out that amount with the same
rule the grant uses, `freeMonthFor` in `src/server/billing/referrals.ts`, so the
question and the credit match. When the referrer had no paid Stripe plan as the
page loaded, the question leaves the amount out and says the reward may keep
waiting. Cancel changes nothing. While the grant runs, both buttons lock and the
dialog cannot close, so a double-click adds one credit.

The app applies the reward as Stripe customer credit on the referrer's next
invoice. A monthly subscription earns its monthly plan price. A yearly
subscription earns one twelfth of its yearly plan price, rounded to cents. The
referrer must have a live Stripe subscription before an administrator can grant
the reward.

Stripe idempotency keys and a database row lock make the grant safe to retry.
The same lock coordinates grant and refund handling. A full refund of the
referred member's qualifying payment closes a pending reward. If the reward was
already granted, the app adds an equal debit to reverse the credit. Partial
refunds do not change the reward.

## Stripe and deployment

Run migration `0074_custom_shell_referrals.sql` before using this feature. It
adds referral codes to existing accounts and creates the referral ledger.

The Stripe webhook must receive these events in addition to the subscription
events already required by billing:

- `invoice.payment_succeeded` records the first paid subscription conversion.
- `charge.refunded` reverses a reward after the whole qualifying charge is
  refunded.

Test the complete path with Stripe test keys. Copy member A's Home page invite
link, register and verify member B, subscribe member B with a Stripe test card,
then confirm that member A sees a converted referral. Grant the pending reward
from the admin Referrals page. The question must name member A and the credit,
and Stripe's customer balance for member A must move by that amount.
Fully refund member B's qualifying charge and confirm the reward changes to
reversed and the credit is offset.
