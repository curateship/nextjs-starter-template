# Restarting the engine from the Workers screen

Each worker card on the Workers screen has a Restart button beside its two
switches. Pressing it and confirming writes a "restart requested" mark on the
worker's control row — the same `trade_worker_controls` row the switches live
on, in a `restart_requested_at` column.

## What happens next

The engine reads its control row at the top of every pass, about once a
second, so it sees the mark within a second. It then:

1. clears the mark, so the replacement copy boots clean instead of reading
   the same request and restarting itself again;
2. stops starting new passes and gives every pass already working up to five
   seconds to finish writing down its orders;
3. if five seconds pass first, writes the wallet count on the worker console;
4. releases the leader lock and exits with code 0.

The container supervisor (Coolify's restart policy) starts the replacement
within a few seconds. Because the lock was handed back before the exit, the
new copy trades within milliseconds of starting instead of waiting for the
old copy's socket to time out. The card's "Running since" line resets when
the new copy's first heartbeat arrives.

While the mark is set and the engine has not picked it up, the card's
"Doing now" line reads "Restart requested".

## What Restart is not

- **Not an endless wait.** A pass gets five seconds to finish. After that the
  engine says how many wallets were in the pass and exits, so a slow exchange
  cannot stop the container from being replaced.
- **Not a fix for the hourly lock drop.** The engine already survives that by
  re-queuing for the lock (see the comment in `worker/src/index.ts`).
- **Not available to members.** The server function is admin-only, like the
  switches.

## Dev never exits

The website's dev server runs the same pass loop when no worker holds the
lock. It registers no restart handler, so a Restart pressed against dev
clears the mark, logs one line, and kills nothing. Only the worker binary
(`worker/src/index.ts`) registers the exit.

The same is true of the deployed website on the rare day it is the one
holding the lock (the worker down for over a minute). Pressing Restart then
clears the mark and restarts nothing, because the website must never exit
itself. The card simply stops saying "Restart requested"; the fix for a
missing worker is starting the worker, not this button.

## One thing to confirm on the server

The engine exits 0, so Coolify's restart policy for the engine resource must
be "always" or "unless stopped" — a policy of "on failure only" would not
start a replacement after a clean exit. The hourly-crash episode showed
Docker bringing the engine back on its own, which suggests the policy is
right, but it has not been read off the server. Check it before trusting the
button in production.

## If it does not come back

There is no second watcher. The existing engine health monitor sends its
outage notice after 45 seconds without a heartbeat, and a restart that failed
to come back is exactly that.

## One copy at a time

Only the leader runs passes, so only the leader reads the mark — a restart
restarts the copy that is trading. A standby waiting for the lock is not
asked to exit.
