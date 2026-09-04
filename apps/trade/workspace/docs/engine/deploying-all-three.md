# Deploying all three, and why an old container can never trade again

Trade runs as three containers on the German box, each its own Coolify app:
the website, the shell worker and the engine. Each one builds whatever
`develop` is at the moment its own Deploy button is pressed. Pressing one
button leaves the other two on whatever build they last got.

That is how the same thing happened twice. On 3 Sep 2026 and again on 4 Sep,
the engine was redeployed on its own. While it was away the website and the
shell worker, still a build from 24 Aug, took the trading lock, and for a few
minutes old code ran over live grids: short grids read as buying grids, plans
saved back without their direction, split and leverage, coins bought that no
grid had asked for. Nothing was lost the second time, and it still must not
happen a third. Three things now stop it.

## One command deploys all three, in order

```
npm run deploy                 engine, then worker, then web
npm run deploy -- --force      rebuild without Docker's cache
npm run deploy -- --only engine,web
```

`scripts/deploy-trade.mjs` asks Coolify to build the engine, waits for that
build to finish, then the worker, then the website. A build that fails stops
the run, so the other two keep the build they have. Each app is named from
Coolify's own list before anything is rebuilt, so a wrong uuid is said out
loud first.

It is a button, not a schedule. Nobody and nothing runs it on its own; Tyler
types it, or asks for it in the same message. It needs, in the gitignored
`apps/trade/.env.live` or the environment:

- `COOLIFY_API_TOKEN` — minted in Coolify under Keys & Tokens → API.
- `COOLIFY_URL` — defaults to the German box.
- `COOLIFY_TRADE_ENGINE`, `COOLIFY_TRADE_WORKER`, `COOLIFY_TRADE_WEB` — the
  three app uuids; the defaults are today's.

Pressing the three buttons in Coolify by hand still works. The rule is the
same either way: all three, engine first.

## The newest build leads, and an older one hands the lock back

Every build is stamped with the moment it was built, and in a Coolify build
with the commit it was given (`src/lib/build-stamp.ts`; the website's stamp
comes from `vite.config.ts`, the engine's and worker's from
`scripts/build-worker.mjs`). A dev server and a test run have no stamp.

The trading lock remembers the build time of the newest copy that has held
it, on the ladders row of `trade_worker_controls` (migration 0161,
`leader_build_at` and `leader_build`). The moment a copy takes the lock,
`buildAllowedToLead` in `src/server/trade/leadership.ts` compares the two:

- **Newer, or the same:** it writes itself down as the newest leader and
  trades.
- **Older:** it unlocks at once and says why, once, on its console: "this
  copy was built 2026-09-03 12:00 UTC, and a copy built 2026-09-04 12:55 UTC
  has led since. Redeploy this container so it runs the current build." The
  engine keeps asking every thirty seconds and its Workers card reads
  "Standing back: …" until it is redeployed. The card also shows the build
  every copy is running, so a container left behind is found by reading the
  card.

A deliberate rollback is a fresh build with a fresh time, so it leads. Only a
container that was never rebuilt is refused. A dev copy neither raises the
bar nor is held to it, so running the app locally against the live database
behaves as before.

Until the website has run migration 0161 the columns do not exist. A copy
that finds them missing is let through with one warning rather than refused,
because the engine deploys before the website and a lock nobody could take
would stop every wallet trading.

**What no code can do:** none of this reaches a container that was built
before it existed. The website and the shell worker must be redeployed once
by hand; from that deploy on, the rule holds whichever button is pressed.

## A saved plan keeps the fields a build does not know

Every plan change adds fields and never renames one, so an older build can
read a newer row. It used to drop the fields it did not know when it saved
the row back, which is exactly what stripped SUSHI's grid on 4 Sep.

Reading a plan now keeps every unknown field, on the plan and on each of its
levels or rungs (`gridPlanReader` in `src/lib/trade/grid.ts`,
`ladderPlanReader` in `dca.ts`, and the same for signal and watch plans), so
saving it back writes them out again untouched. The engine already leaves a
row with unknown fields alone entirely (`worker-restart.md`); this is the
second lock on the same door, for the website's own saves such as a pause, a
cancelled level or a dragged range.
