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

## In production only the engine trades

The deployed website and the deployed shell worker never take the lock, so
while the engine is restarting nothing trades. Every stop already rests on
the exchange, and the engine is back within seconds, so nothing is lost by
waiting.

Both ways the website used to trade are switched off in production. Its
background loop never starts, and the dashboard's four-second refresh never
takes the lock for a one-off pass. The second path matters during a rolling
deploy: the old website remains available while the engine changes containers,
and the engine's lock is briefly free. The refresh now waits for the new engine
instead of running the previous website build over live grids.

They used to stand in after a minute without an engine. That is what ended
seven short grids on 3 Sep 2026. Tyler redeployed the engine on its own, and
in the thirty seconds it was away the Trade Worker container took the lock.
That container was still the build from before short grids existed, so it
read each short grid as a buying grid holding a short, ended all seven as
"stopped", and saved the grids back without their Short setting. Nothing was
sold, because the stops rest on Hyperliquid, but the grids stopped managing
their coins. A stand-in that runs old code is worse than no stand-in.

**Deploy Web, Worker and Engine together.** Each Coolify app builds whatever
`develop` is at the moment its button is pressed, so pressing one leaves the
other two on older builds. `npm run deploy` presses all three in order, and
since 4 Sep 2026 a copy built before the newest leader is refused the lock
whichever button was pressed. `deploying-all-three.md` has both.

## A row written by a newer build is left alone

Every plan change adds fields and never renames one, so an older build can
still read a newer row: the reader drops the fields it does not know. That
is fine for a screen and dangerous for the engine, which saves the plan back
after every pass and would save it without those fields.

So both engine passes now check a row's saved plan before touching it. A
plan with a field this build has never heard of belongs to a newer build.
The row is skipped: not traded, not saved, not ended. The engine's console
says so once per row, naming the fields, so a stale container is found
instead of guessed at. The check lives in `unknownPlanFields` in
`src/lib/trade/smart-plan.ts` and `leftForANewerBuild` in
`src/server/trade/left-for-newer-build.ts`.

The same check runs the other way. A grid saved back by an older build has
lost its `direction`, and reading it as "long" is how twelve stripped short
grids kept trading for six minutes on 4 Sep 2026 after the old website was
gone. A grid with no direction is skipped the same way, with its own console
line (`missingPlanFields`, same file). `deploying-all-three.md` has the
whole story.

This protects the next time round, not the last one. The build that did the
damage on 3 Sep had no such check, and no change made today can reach a
container that has already been built.

The engine heartbeat also says whether it understands the DCA market-first
field. The web app checks every live engine and standby before saving a real
ladder with that field. An old copy makes placement fail without creating a
ladder. This keeps a newer web process from leaving an order that the older
engine correctly refuses to touch. A ladder that did not ask for the immediate
buy does not store the field and remains compatible with the older engine.

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
