-- Conversations are no longer opened and closed (Tyler, 9 Nov 2026: "remove
-- the open and closed \"status\" I dont understand the purpose of it"). Every
-- conversation that was closed by hand comes back into the inbox. Closed now
-- means only "from a blocked sender", so a conversation whose address, or
-- whose address's domain, is on the site's blocked list stays closed.
UPDATE crm_threads AS thread
SET status = 'open', snoozed_until = NULL, updated_at = now()
FROM crm_leads AS lead
WHERE thread.lead_id = lead.id
  AND thread.status = 'closed'
  AND NOT EXISTS (
    SELECT 1
    FROM crm_blocked_senders AS blocked
    WHERE blocked.workspace_id = thread.workspace_id
      AND (
        blocked.pattern = lower(lead.email)
        OR (left(blocked.pattern, 1) = '@' AND lower(lead.email) LIKE '%' || blocked.pattern)
      )
  );
