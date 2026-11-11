-- Snoozing is gone (Tyler, 9 Nov 2026: "remove this feature", of Snooze), so
-- nothing would ever wake a snoozed conversation again. Every one comes back
-- into the inbox now. The snoozed_until column stays, unread.
UPDATE crm_threads
SET status = 'open', snoozed_until = NULL, updated_at = now()
WHERE status = 'snoozed';
