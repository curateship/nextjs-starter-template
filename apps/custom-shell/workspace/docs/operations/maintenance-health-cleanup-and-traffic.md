# Maintenance, health, cleanup, and traffic

The maintenance switch changes access in four ways:

- Members and signed-out visitors go to the maintenance page.
- Admins stay signed in so they can repair the product and turn the switch off.
- The header reminds admins that maintenance is active.
- The server trims the saved message and applies a fixed length limit.

The maintenance value shares the platform settings record, but its server action
locks and merges that record in a transaction. A settings save and a maintenance
change cannot quietly overwrite one another.

## Health checks

`/api/health` checks that the web server can query the database. It returns 200
with `status: "ok"` or 503 with `status: "unavailable"`, never caches the answer,
and does not reveal database or host details. The worker has a separate health
check for its heartbeat and database connection.

## Data cleanup

Daily cleanup removes:

- Unusable sessions.
- Old used or expired auth links.
- Finished rate-limit counters.
- Old read notifications.
- Old system email send records.
- Old exhausted email retries.

Daily cleanup keeps billing history, newsletter deliveries, unread notifications,
and active blocks.

Cleanup works in capped batches and runs from the first guarded admin read of
the day. Admin Settings also has a cleanup card for inspecting and running the
same safe cleanup. Verification reminders share the daily sweep but one failure
does not stop the other job.

## Traffic

The traffic beacon ignores:

- Bots and browser prefetches.
- API paths.
- Admin pages.

For the active workspace, the beacon stores:

- Daily views and unique visitors.
- Member and visitor counts.
- Paths and referrer domains.
- Broad device types.

The server hashes the IP address and user agent with a salt that changes each
day. It never stores the raw IP in traffic records. Detailed visit rows last
seven days. Daily totals remain after visitor hashes and finished daily salts
are removed. The Traffic dashboard reads those totals and the retained facts.
