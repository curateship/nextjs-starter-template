# Deploying all three, and the old server that kept trading

Trade runs as three containers on the German box (46.224.177.156), each its
own Coolify app: the website, the shell worker and the engine. Each one
builds whatever `develop` is at the moment its own Deploy button is pressed.
Pressing one button leaves the other two on whatever build they last got, and
the three then disagree about what a saved plan means. So all three are
deployed together, engine first.

## The old server

Trade first went live on 15 Aug 2026 on a different Hetzner box,
5.78.189.158, with its own Coolify at `http://5.78.189.158:8000` and its own
three Trade apps. When Trade moved to the German box in late August, those
apps were pointed at the database on the German box and never switched off.

Two machines then shared one database. Only one copy may hold the trading
lock, and the old box's website and worker asked for it every second. Every
time the German engine restarted for a deploy, the old box took the lock in
the gap, held it for the five-minute turn its old code allows a stand-in,
and ran a build from 24 Aug over live grids: short grids read as buying
grids, plans saved back without their direction, split and leverage, coins
bought and sold at once. That is 3 Sep, and 4 Sep at 12:52, 18:27, 22:18 and
23:12 UTC. Over thirty short grids ended that way and roughly $60 went on
fees and round trips.

Three days of fixes on the German box (build stamps, "the newest build
leads", "the website never trades in production", deploy order) were aimed
at a stale container on the German box. There was none. None of that code
runs on the old box, so none of it could stop it, and the build-time rule and
its two columns were removed again on 4 Sep (migration 0163). The fix is to
delete the three Trade apps on the old box's Coolify. Its login is separate
and the German box's API token does not work there.

How it was found: `pg_locks` joined to `pg_stat_activity` shows when the
lock-holding connection was opened; a request straight to
`https://5.78.189.158/api/health` with `Host: nodabot.com` opened a fresh
connection to the German database at that second; and dating the stripped
plan's fields against `git log -S` on `grid.ts` put the writer between 24
and 25 Aug.

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
loud first. The engine goes first so a new website never writes a field an
old engine misreads; the engine leaves a row with unknown fields alone in any
case (below).

It is a button, not a schedule. Nobody and nothing runs it on its own; Tyler
types it, or asks for it in the same message. It needs, in the gitignored
`apps/trade/.env.live` or the environment:

- `COOLIFY_API_TOKEN` — minted in Coolify under Keys & Tokens → API.
- `COOLIFY_URL` — defaults to the German box.
- `COOLIFY_TRADE_ENGINE`, `COOLIFY_TRADE_WORKER`, `COOLIFY_TRADE_WEB` — the
  three app uuids; the defaults are today's.

Pressing the three buttons in Coolify by hand still works. The rule is the
same either way: all three, engine first.

### When a build fails while downloading packages

The first run of `npm run deploy` on 4 Sep 2026 failed inside `pnpm install`
with "Lockfile failed supply-chain policy check" after four minutes. pnpm 11
holds every newly published version back for a day and, on each install,
re-checks every lockfile entry by downloading the package's full registry
metadata for its publish dates. That is 1467 documents, and the Solana
codecs package's document alone is 10 MB, which the box's slow registry link
could not finish. `trustLockfile: true` in the root `pnpm-workspace.yaml`
skips that re-check when installing from the committed lockfile. The
day-long hold still applies on the laptop whenever a package is added, which
is where it does its work.

## A grid with no direction saved is not traded

A grid's direction reads as "long" when the field is missing, which was
right for grids placed before the field existed on 28 Aug 2026 and is wrong
for a short grid an old build has just stripped. On 4 Sep 2026 at 22:18 UTC
the old server (below) stripped twelve short grids; the engine then took the
lock at 22:23 and read every one of them as a buying grid. JUP kept buying
and selling at once until 22:29.

So the engine now leaves a grid with no `direction` alone, the same way it
leaves a row with unknown fields alone: not traded, not saved, not ended,
and one line on the engine's console naming the row and the field
(`missingPlanFields` in `src/lib/trade/smart-plan.ts`, applied by
`leftForANewerBuild`). No live grid lacked the field on 4 Sep, so nothing
already running is affected. A grid that does lack it needs a person to
look at it: an old build damaged it. At 23:13 the same night this guard held
AVNT untouched after the old server stripped it, which is the one useful
thing all of September's engine changes did.

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
