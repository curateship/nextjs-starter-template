# Newsletter Broadcasting, Cron, Drip, Pause, Send Window, and Tracking

This document explains how newsletter broadcasting currently works in the app, how drip scheduling is processed, how pause/resume behaves, how send windows are enforced, and how open/click tracking reaches the dashboard.

It is based on the current code in:

- `apps/hub/src/lib/actions/newsletters/newsletter-actions.ts`
- `apps/hub/src/app/api/cron/newsletters/route.ts`
- `apps/hub/src/app/api/webhooks/resend/route.ts`
- `apps/hub/src/app/admin/newsletters/page.tsx`
- `apps/hub/src/app/admin/newsletters/[newsletterId]/page.tsx`

## High-level model

There are 3 separate systems involved:

1. Broadcast creation and first send
2. Cron-based continuation of sending
3. Resend webhook-based engagement tracking

Those systems are related, but they do different jobs:

- `sendNewsletter()` starts the broadcast and may send the first batch immediately
- the cron route sends later batches
- the webhook route records opens, clicks, bounces, complaints, and delivered events after Resend sends callbacks back to the app

## Main statuses

Newsletter status is stored on the newsletter record.

The relevant values are:

- `draft`
- `scheduled`
- `sending`
- `sent`
- `paused`

Important meaning:

- `sending` means the cron route is allowed to process this newsletter
- `paused` means the cron route ignores it completely
- `sent` means all sending work is finished

That point matters because `next_batch_at` does not drive the scheduler by itself. Status does.

## Broadcast start flow

The first send happens in `sendNewsletter()` in `newsletter-actions.ts`.

At a high level it does this:

1. Validate the newsletter and load eligible contacts
2. Load the configured email provider
3. Check whether drip is enabled
4. If drip is enabled, determine whether the current time is inside the allowed send window
5. If inside the window, send the first batch
6. If not inside the window, do not send yet; instead store a future `next_batch_at`
7. After first-batch send, keep the newsletter in `sending` if more contacts remain

### Drip mode at initial send

If drip is enabled:

- the first send uses a random batch size between `batch_size_min` and `batch_size_max`
- if more contacts remain after the first batch, the newsletter stays in `sending`
- the code stores:
  - `next_batch_at`
  - `batches_sent`
  - `total_bounced`
  - `paused_reason`

### Initial send window behavior

Drip send windows are checked during initial send using:

- `send_window_start`
- `send_window_end`
- `send_window_timezone`

If the send is attempted outside the allowed window:

- the first batch is not sent
- the newsletter is left in a waiting state
- `next_batch_at` is written

This was previously broken for the initial batch. The cron route respected the send window, but the initial send path did not. That was fixed so both initial send and later cron batches now honor the window.

## Cron continuation flow

Later sending is handled by:

- `apps/hub/src/app/api/cron/newsletters/route.ts`

This route does not send everything continuously on its own. It only runs when your external cron hits it with the correct `CRON_SECRET`.

### What the cron route processes

The cron route:

1. Moves `scheduled` newsletters whose `scheduled_at <= now` into `sending`
2. Loads newsletters where `status = 'sending'`
3. For each sending newsletter, decides whether it is eligible to send another batch

This means:

- `paused` newsletters are not processed at all
- `sent` newsletters are not processed at all

### Cron gating order

For drip newsletters, the cron route applies these gates:

1. If `next_batch_at` is in the future, skip
2. If current time is outside the send window, skip
3. Otherwise send the next batch

This is why `next_batch_at` is not an exact send promise. It is only an earliest eligible time.

A batch will actually send only when:

- the newsletter is still `sending`
- `next_batch_at` has passed
- current time is inside the allowed send window
- the cron route runs again

## What `next_batch_at` really means

`next_batch_at` is not a guaranteed exact send timestamp.

It means:

- "do not send before this time"

It does not mean:

- "the app will definitely send exactly at this second"

Why:

- the app does not have an always-running internal scheduler
- it only checks eligibility when the cron endpoint is called

So if:

- `next_batch_at = 8:27:39 PM`
- cron runs every 5 minutes

then actual send might happen at:

- `8:30 PM`
- or later if another gate blocks it

## How the send window works

The send window is enforced using the configured timezone and hour range.

Relevant fields:

- `send_window_start`
- `send_window_end`
- `send_window_timezone`

Example:

- start: `09:00`
- end: `15:00`
- timezone: `America/New_York`

The cron route converts the current time into that timezone, then checks whether the current local minutes are within the allowed range.

### Important rule

If `next_batch_at` is already in the past but the current time is still outside the send window:

- nothing sends yet
- the newsletter waits
- the next batch goes out on the first cron run after the send window opens again

So the real rule is:

- both conditions must be true:
  - `next_batch_at` must be satisfied
  - current time must be inside the send window

## Pause and resume behavior

Pause/resume lives in:

- `pauseNewsletter()`
- `resumeNewsletter()`

in `newsletter-actions.ts`.

### What pause means

Pause changes the newsletter status from:

- `sending` -> `paused`

Since the cron route only processes `sending`, pause immediately removes the newsletter from the active sending queue.

That part is intentional.

### Why pause previously felt broken

Previously:

- pause just set status to `paused`
- resume set `next_batch_at = now`

That meant resume did not continue the schedule. It effectively jumped the newsletter back into the queue immediately.

That behavior was confusing because it did not behave like a real pause.

### Current pause/resume behavior

Pause now stores:

- `paused_at`
- `paused_remaining_ms`

The app computes `paused_remaining_ms` from the difference between:

- stored `next_batch_at`
- current time when pause is clicked

Resume now:

- changes status back to `sending`
- restores `next_batch_at` to `now + paused_remaining_ms`
- clears `paused_at`
- clears `paused_remaining_ms`

That means pause now behaves like a real timer pause:

- if there were 7 minutes left when paused
- there will still be about 7 minutes left after resume

### Pause and send windows together

If you pause during allowed hours and resume outside allowed hours:

- resume restores the remaining delay
- but the cron route still checks the send window
- if the current time is outside allowed hours, it waits
- when the window opens again, the next cron run can send the batch

In practice:

- resume does not bypass send-window rules
- pause only preserves the timer

## Why the UI could look wrong

The previous UI displayed raw stored metadata too literally.

Examples of misleading UI:

- showing `Next batch: 8:27:39 PM` even after that time had already passed
- showing `Sending` even when the newsletter was actually blocked by send-window rules

This happened because the UI was printing persisted `drip_config` values without interpreting them against the current time.

### Current UI interpretation

The builder page and dashboard now interpret the current state more intelligently.

They can now show states like:

- `Waiting for window`
- `Waiting for cron`
- `Paused`
- `Sending`

And the builder detail line can show:

- `Next batch: ...` only if that time is still in the future
- `Waiting for send window` if outside allowed hours
- `Waiting for next cron run` if the time is already past and the app is just waiting for the next cron execution

## Why "Next batch" can be in the past and still be correct

This is one of the most confusing parts.

If `next_batch_at` is in the past, that does not mean the app is broken.

It can still be waiting because:

1. the send window is closed
2. the newsletter is paused
3. cron has not run yet since it became eligible

So "past next batch time" really means:

- the interval delay has finished

It does not mean:

- the batch must have already been sent

## Resend opens and clicks

Open and click percentages in the app do not come from querying Resend live for every dashboard load.

Instead, this app uses:

1. send email through Resend
2. receive Resend webhook events
3. store those events locally
4. aggregate dashboard stats from the local DB

### Why the app uses local DB counts

The app dashboard reads local fields like:

- `total_opened`
- `total_clicked`

That design makes the app use its own database as the source of truth.

Benefits:

- no live dependency on Resend for page loads
- local per-newsletter history
- local per-contact event history in `newsletter_events`

## Why opens and clicks were showing zero

The app was sending correctly, and Resend itself was tracking opens/clicks correctly, but the app dashboard stayed at zero.

The root cause was in:

- `apps/hub/src/app/api/webhooks/resend/route.ts`

That route was verifying webhook signatures using `site_integrations.config.webhook_secret` directly from the DB.

But in this app:

- Resend `webhook_secret` is stored encrypted

So the route was effectively trying to verify the webhook using the encrypted value instead of the real secret.

Result:

- sends worked
- Resend dashboard showed opens/clicks
- the app rejected webhook callbacks during signature verification
- no `opened` or `clicked` events were stored
- local dashboard percentages stayed at zero

### Fix

The webhook route now decrypts `webhook_secret` before signature verification.

That means future opens/clicks should now record correctly as long as:

- Resend webhook endpoint is configured correctly
- the webhook secret in the app matches the Resend webhook secret
- the webhook events are enabled in Resend

### Important limitation

This fix only helps future webhook deliveries.

It does not retroactively reconstruct old opens/clicks that were never stored locally.

## Why there is no endpoint URL field in site settings

The app stores:

- Resend API key
- Resend webhook secret
- from email
- from name

It does not store the webhook endpoint URL.

That URL belongs in the Resend dashboard, not in app site settings.

Expected setup:

- Resend dashboard endpoint URL:
  - `https://systemeverything.com/api/webhooks/resend`
- App settings:
  - matching `webhook_secret`

## Real mental model to use

The simplest way to think about the system is:

- status controls whether cron is allowed to touch the newsletter
- `next_batch_at` says "not before this time"
- send window says "only during these hours"
- cron execution says "only when the cron route actually runs"
- pause removes it from the active queue
- resume restores the remaining delay, but still obeys the send window
- opens/clicks only show in the app if the Resend webhook is successfully verified and stored locally

## Common scenarios

### Scenario: first batch sends immediately

If drip is enabled and the current time is inside the send window:

- the first batch sends immediately
- remaining contacts wait for cron-driven continuation

### Scenario: first batch does not send immediately

If drip is enabled and the current time is outside the send window:

- nothing sends yet
- the app stores waiting metadata
- the first send happens later when cron runs during allowed hours

### Scenario: "Next batch" time passed but nothing sent

Possible reasons:

- the newsletter is paused
- the send window is closed
- cron has not run yet

### Scenario: paused during allowed hours, resumed outside allowed hours

Result:

- the remaining timer is restored
- but no email sends until the next allowed send window and the next cron hit

### Scenario: Resend shows opens but app shows 0%

Most likely cause:

- webhook callbacks are not being accepted or recorded locally

In the recent bug we found:

- the app was verifying against the encrypted webhook secret instead of the real one

## Known design constraints

Some confusion is structural, not just a bug:

- cron-driven systems cannot promise exact second-level send times
- `next_batch_at` is inherently approximate because cron polling is approximate
- UI that prints raw metadata without interpreting it can easily look wrong

The current improvements make the system much easier to understand, but the scheduler still fundamentally works as:

- state + eligibility + cron polling

not as:

- exact timestamp execution

