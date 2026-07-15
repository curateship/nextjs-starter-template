# Performance

## Browser session capacity

Capacity uses the single `capacity_config.default` row. The defaults reserve
1,536 MB RAM and 0.5 vCPU per active profile, with a per-user concurrency cap
of five. Worker totals and launch status come from the `nodes` table. Migration
`0012_capacity.sql` seeds an 8 GB / 4 vCPU `local` node; operators must update
those totals to match the deployed host.

For each node, the dashboard calculates capacity use as the greater of live
Docker usage and the active-session reservation:

```text
RAM used      = max(sum(container RAM), active sessions × profile RAM budget)
vCPU used     = max(sum(container vCPU), active sessions × profile vCPU budget)
headroom      = max(0, node total − used)
profiles left = floor(min(RAM headroom / RAM budget,
                          vCPU headroom / vCPU budget))
```

This keeps launch decisions conservative when containers are idle. If Docker
stats are partial or unavailable, the dashboard labels them accordingly and
continues to show the reservation-backed capacity value.

`startSession` serializes reservations through the node row, then rejects a
launch when the user cap, resource budget, configured node status, or
`ANTIDETECT_MAX_BROWSER_SESSIONS` limit would be exceeded. Idle sessions are
stopped by the scheduler and their `session_reaped` alerts feed the capacity
dashboard.
