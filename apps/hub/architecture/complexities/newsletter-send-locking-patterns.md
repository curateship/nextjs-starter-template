# Newsletter Send And Automation Drip Pipeline

This note records how broadcast newsletters and automation drip emails move from scheduled work to provider sends, how cron processes them, and how duplicate sends are prevented.

## Why This Matters

Newsletter sends can take longer than the cron interval.

That creates a dangerous shape:

1. one cron run starts sending a batch
2. the next cron run starts before the first run saves its next state
3. both runs see the same send as eligible
4. contacts can receive duplicate emails

The reporting layer can mark duplicate delivery rows, but that happens after provider send. It protects stats, not inboxes.

## Shared Concepts

### Cron

Newsletter sending is cron-driven.

Primary cron routes:

- `src/app/api/cron/newsletters/route.ts`
- `src/app/api/cron/email-automations/route.ts`

The routes are protected by `CRON_SECRET`.

Cron frequency is allowed to be shorter than send duration. The safety requirement is that overlapping cron runs must not send the same work twice.

### Drip Config

Drip settings control batch size, interval, bounce threshold, and optional send windows.

Shared send-window logic lives in:

- `src/lib/actions/newsletters/send-windows.ts`

Important fields:

- `enabled`
- `batch_size_min`
- `batch_size_max`
- `interval_min_minutes`
- `interval_max_minutes`
- `bounce_threshold_percent`
- `send_windows`
- `send_window_timezone`
- `next_batch_at`
- `batches_sent`

### Delivery Rows And Stats

Every successful provider send should create a `newsletter_deliveries` row.

Rollups live in `newsletter_source_stats`.

Relevant file:

- `src/lib/actions/newsletters/event-stats.ts`

Delivery recording:

- normalizes broadcast step order to `0`
- normalizes automation step order to `>= 1`
- checks whether the same contact/source/step was already recorded
- marks later rows as duplicate sends
- increments source stats only for non-duplicate sends

Important limit:

- this duplicate marking happens after provider send
- it is not enough to prevent duplicate inbox delivery

## Broadcast Newsletter Pattern

Broadcast sends are owned by one `newsletters` row.

Relevant files:

- `src/app/api/cron/newsletters/route.ts`
- `src/lib/actions/newsletters/newsletter-actions.ts`
- `src/lib/actions/newsletters/event-stats.ts`

### Storage Model

Broadcast newsletter state lives on `newsletters`.

Important fields:

- `status`
- `scheduled_at`
- `sent_at`
- `total_recipients`
- `total_sent`
- `audience_filter`
- `metadata.drip_config`
- `metadata.delivery_lock_token`
- `metadata.delivery_lock_started_at`

### Status Flow

Typical status flow:

1. `draft`
2. `scheduled`
3. `sending`
4. `sent`

Paused drip sends use:

- `paused`

### Cron Flow

The broadcast cron route:

1. moves due `scheduled` newsletters to `sending`
2. loads all `sending` newsletters
3. acquires a newsletter-level lock
4. skips if email config or content is missing
5. checks drip timing:
   - if `next_batch_at` is in the future, skip
   - if outside send windows, skip
6. loads previous `newsletter_deliveries` rows for this broadcast
7. loads active contacts matching the audience filter
8. removes contacts already sent for this broadcast
9. slices the next batch
10. sends through the provider
11. records delivery rows and source stats
12. updates totals
13. if drip and more contacts remain, sets the next `next_batch_at`
14. if complete, marks the newsletter `sent`
15. clears the lock

### Drip Broadcast Behavior

For drip-enabled broadcasts:

- the batch size is randomized between `batch_size_min` and `batch_size_max`
- the interval is randomized between `interval_min_minutes` and `interval_max_minutes`
- `next_batch_at` controls when the next batch may run
- send windows can block sending even if `next_batch_at` is due
- bounce threshold can auto-pause the newsletter

For non-drip broadcasts:

- the cron uses the fixed route batch size
- the send continues over cron runs until all matching contacts are sent

### Lock Scope

Broadcast locking is per newsletter.

The lock is stored on:

- `newsletters.metadata.delivery_lock_token`
- `newsletters.metadata.delivery_lock_started_at`

### Flow

1. acquire a delivery lock on the newsletter row
2. skip the newsletter if another worker already holds the lock
3. send the batch
4. record delivery rows and source stats
5. save final newsletter state or next drip batch time
6. clear the lock
7. release the lock in `finally` if the send exits early

### Duplicate Protection Layers

- pre-send newsletter lock prevents overlapping batch workers
- delivery recording marks duplicate contact/source/step rows after send
- broadcast audience filtering excludes contacts already present in `newsletter_deliveries`

The lock is the main inbox protection.

## Automation Drip Pattern

Automation sends are not owned by one newsletter row. They are owned by many active enrollments moving through ordered automation steps.

Relevant files:

- `src/app/api/cron/email-automations/route.ts`
- `src/lib/actions/newsletters/automation-actions.ts`
- `src/lib/actions/newsletters/event-stats.ts`

### Storage Model

Automation definitions live in:

- `email_automations`
- `email_automation_steps`

Per-contact progress lives in:

- `email_automation_enrollments`

Important automation fields:

- `email_automations.status`
- `email_automations.trigger_type`
- `email_automations.trigger_config`
- `email_automation_steps.step_order`
- `email_automation_steps.node_type`
- `email_automation_steps.delay_minutes`
- `email_automation_steps.node_config.drip_config`
- `email_automation_enrollments.current_step_order`
- `email_automation_enrollments.last_step_sent_at`
- `email_automation_enrollments.status`

### Enrollment Flow

Contacts enter an automation through triggers.

Current trigger examples:

- segment added
- lead magnet signup
- paid purchase

Enrollment starts with:

- `current_step_order = 0`
- `status = active`

The cron always evaluates the next step as:

- `current_step_order + 1`

When a step completes, the enrollment advances to that step order.

### Step Types

Automation cron handles:

- `delay`
- `email`
- `end_rules`

Delay step:

- waits until `last_step_sent_at` or `enrolled_at` plus `delay_minutes`
- advances the enrollment when due

Email step:

- checks subject
- checks delay timing
- applies drip settings if enabled
- sends through the provider
- records delivery
- advances the enrollment

End-rules step:

- checks purchase goal or prior engagement
- either advances, marks `goal_met`, or cancels enrollment

### Cron Flow

The automation cron route:

1. computes an enrollment scan limit from the largest active drip batch size plus a buffer
2. loads active enrollments for active automations
3. orders enrollments by `current_step_order`, then `enrolled_at`
4. finds the next step for each enrollment
5. skips enrollments whose delay has not passed
6. processes delay and end-rules steps directly
7. for email steps, checks subject and contact status
8. for drip-enabled email steps:
   - skips if `next_batch_at` is in the future
   - skips if outside send windows
   - acquires a step-level lock
   - sends up to the randomized drip batch limit
9. before provider send, checks whether this contact already has a delivery row for this automation step
10. if delivery exists, advances the enrollment without sending again
11. sends through the provider
12. records delivery rows and source stats
13. advances the enrollment
14. saves step drip state
15. clears the step lock

### Drip Automation Behavior

For drip-enabled automation email steps:

- the batch size is randomized between `batch_size_min` and `batch_size_max`
- the interval is randomized between `interval_min_minutes` and `interval_max_minutes`
- `next_batch_at` lives in the step's `node_config.drip_config`
- `batches_sent` lives in the step's `node_config.drip_config`
- send windows can block sending even if `next_batch_at` is due

Important difference from broadcasts:

- broadcasts select an audience and filter out previously sent contacts
- automations scan active enrollments and advance each enrollment through steps

That means automation scan ordering matters. Earlier-step enrollments must be prioritized so contacts still waiting on email 1 are not hidden behind contacts already waiting on later steps.

### Lock Scope

Automation locking is per email step.

The lock is stored on:

- `email_automation_steps.node_config.drip_lock_token`
- `email_automation_steps.node_config.drip_lock_started_at`

It is step-scoped so different automation emails can still run independently.

### Flow

1. cron scans active enrollments, ordered by `current_step_order` then `enrolled_at`
2. scan size is based on the largest active drip batch size plus a buffer
3. when a drip email step is eligible, acquire a step lock
4. skip the step if another worker already holds the lock
5. before each provider send, check whether this contact already has a delivery row for the same automation step
6. if a delivery exists, move the enrollment forward without sending again
7. send eligible contacts until the drip batch limit is reached
8. save `last_batch_at`, `batches_sent`, and optional `next_batch_at`
9. clear the step lock
10. release the lock in `finally` if saving state fails

### Duplicate Protection Layers

- pre-send step lock prevents overlapping cron runs for the same automation email step
- pre-send delivery lookup prevents resending a contact if the delivery was recorded but enrollment state did not advance
- delivery recording still marks duplicate contact/source/step rows after send

The lock is the main inbox protection. The pre-send delivery lookup is a backup for partial state updates.

## Key Differences

Broadcast:

- one send source is one newsletter row
- lock lives in `newsletters.metadata`
- audience is selected directly from contacts and previous deliveries
- progress is tracked on the newsletter row and metadata
- `next_batch_at` lives in newsletter metadata

Automation:

- one send source is an automation step plus many enrollment rows
- lock lives in `email_automation_steps.node_config`
- progress is tracked by `email_automation_enrollments.current_step_order`
- drip state lives in `email_automation_steps.node_config.drip_config`
- `next_batch_at` lives in step `node_config.drip_config`
- the cron must prioritize earlier-step enrollments so unfinished first-step contacts are not hidden behind contacts already waiting on later steps

## Important Rule

Do not rely on post-send duplicate marking to prevent duplicate inbox delivery.

Post-send duplicate marking is reporting protection only.

Any code path that can call the email provider for a broadcast or automation batch needs a pre-send lock around the send owner:

- broadcast owner: newsletter row
- automation owner: email step row

## Practical Rules Going Forward

- Keep broadcast locks on `newsletters.metadata`.
- Keep automation drip locks on `email_automation_steps.node_config`.
- Do not move automation locks to the automation row unless all steps must become mutually exclusive.
- Do not remove pre-send delivery checks from automation; they protect partial state-update failures.
- Keep delivery recording duplicate detection as a reporting backstop, not the primary safety mechanism.
- If cron frequency or batch size changes, keep the lock. Longer intervals reduce overlap risk but do not remove it.
- If automation batch sizing changes, keep the enrollment scan size tied to configured drip batch sizes.
- If automation step progression changes, preserve `current_step_order + 1` as the core next-step model unless the enrollment schema is redesigned.
