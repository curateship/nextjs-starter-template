import { desc, eq, inArray, sql } from "drizzle-orm"

import {
  WORKER_KINDS,
  WORKER_LABELS,
  safeWorkerError,
  type WorkerKind,
  type WorkerStatus,
  type WorkersDashboardData,
} from "@/lib/workers"
import { db, type CustomShellDb } from "@/server/db"
import { getMarketScannerPaused } from "@/server/market-scanner"
import {
  scannerAlerts,
  tradingBacktests,
  tradingBotState,
  tradingBots,
  tradingWorkerHeartbeats,
} from "@/server/schema"

import { listWorkerControls } from "./control"

const ONLINE_WINDOW_MS = 30_000

const DESCRIPTIONS: Record<WorkerKind, string> = {
  bot: "Runs live and paper bots and their direct market feeds.",
  "whale-scanner":
    "Collects whale trades, wallets, positions, and research alerts.",
  "market-scanner": "Evaluates saved market rules and creates market alerts.",
  alert: "Watches Trade alert rules against its own live market feed.",
  backtest: "Runs queued historical simulations and saves their results.",
}

type SafeMeta = Record<string, unknown>

export async function getWorkersDashboard(
  userId: string,
  canControl: boolean,
  database: CustomShellDb = db
): Promise<WorkersDashboardData> {
  const checkedAt = new Date()
  const [
    controls,
    heartbeats,
    botCounts,
    backtests,
    marketRuleStats,
    userPaused,
    whaleActivity,
    botActivity,
    watchdogAlerts,
  ] = await Promise.all([
    listWorkerControls(database),
    database
      .select()
      .from(tradingWorkerHeartbeats)
      .orderBy(desc(tradingWorkerHeartbeats.lastSeenAt))
      .limit(100),
    database
      .select({ waiting: sql<number>`count(*)::int` })
      .from(tradingBots)
      .where(eq(tradingBots.desiredState, "running")),
    database
      .select({
        queued: sql<number>`count(*) filter (where ${tradingBacktests.status} = 'pending')::int`,
        running: sql<number>`count(*) filter (where ${tradingBacktests.status} = 'running')::int`,
        lastCompletedAt: sql<Date | null>`max(${tradingBacktests.completedAt}) filter (where ${tradingBacktests.status} = 'done')`,
      })
      .from(tradingBacktests),
    database.execute<{
      enabled_rules: number | string
      markets: number | string
      last_evaluated_at: Date | string | null
    }>(sql`
      select
        count(*)::int as enabled_rules,
        coalesce((
          select count(distinct market)::int
          from market_scanner_rules rules
          cross join lateral jsonb_array_elements_text(rules.markets)
            as expanded_markets(market)
          where rules.enabled
        ), 0) as markets,
        max(last_evaluated_at) as last_evaluated_at
      from market_scanner_rules
      where enabled
    `),
    getMarketScannerPaused(userId, database),
    database.execute<{
      activity_at: Date | string | null
      activity_type: string | null
    }>(sql`
        select activity_at, activity_type
        from (
          select max(ts) as activity_at, 'Whale trades' as activity_type
          from scanner_trades
          union all
          select max(stats_updated_at), 'Wallet stats'
          from scanner_wallet_stats
          union all
          select max(ts), 'Position events'
          from scanner_position_events
          union all
          select max(created_at), 'Crowd signals'
          from scanner_crowd_signals
          union all
          select max(updated_at), 'Book metrics'
          from scanner_book_metrics
        ) recent
        where activity_at is not null
        order by activity_at desc
        limit 1
      `),
    database
      .select({
        lastEvaluatedAt: sql<Date | null>`max(${tradingBotState.lastEvalAt})`,
      })
      .from(tradingBotState),
    database
      .select({
        type: scannerAlerts.type,
        data: scannerAlerts.data,
        createdAt: scannerAlerts.createdAt,
      })
      .from(scannerAlerts)
      .where(inArray(scannerAlerts.type, ["worker_down", "worker_recovered"]))
      .orderBy(desc(scannerAlerts.createdAt))
      .limit(50),
  ])

  const latestWhaleActivity = whaleActivity.rows[0]
  const marketStats = marketRuleStats.rows[0]

  const controlMap = new Map(controls.map((control) => [control.kind, control]))
  const workers = WORKER_KINDS.map((kind): WorkerStatus => {
    const control = controlMap.get(kind)
    if (!control) throw new Error(`Worker control is missing for ${kind}`)
    const kindHeartbeats = heartbeats.filter(
      (heartbeat) => metaOf(heartbeat.meta).workerKind === kind
    )
    const liveHeartbeats = kindHeartbeats.filter(
      (heartbeat) =>
        checkedAt.getTime() - heartbeat.lastSeenAt.getTime() < ONLINE_WINDOW_MS
    )
    const heartbeat =
      liveHeartbeats.find(
        (candidate) => metaOf(candidate.meta).role === "leader"
      ) ?? kindHeartbeats[0]
    const meta = metaOf(heartbeat?.meta)
    const online = liveHeartbeats.length > 0
    const active =
      online &&
      control.enabled &&
      !control.paused &&
      meta.serviceActive === true
    const currentActivity = online
      ? safeText(meta.currentActivity, active ? "Running" : "Idle")
      : "Not connected"
    const state = !online
      ? "offline"
      : !control.enabled
        ? "off"
        : control.paused
          ? "paused"
          : active && /waiting|idle/i.test(currentActivity)
            ? "idle"
            : active
              ? "running"
              : "idle"
    const lastSuccessfulWorkAt =
      kind === "bot"
        ? isoOf(botActivity[0]?.lastEvaluatedAt)
        : kind === "whale-scanner"
          ? isoOf(latestWhaleActivity?.activity_at)
          : kind === "market-scanner"
            ? isoOf(marketStats?.last_evaluated_at)
            : kind === "alert"
              ? null
              : isoOf(backtests[0]?.lastCompletedAt)

    const lastDown = watchdogAlerts.find(
      (alert) =>
        alert.type === "worker_down" && watchdogAlertKind(alert.data) === kind
    )
    const lastRecovered = watchdogAlerts.find(
      (alert) =>
        alert.type === "worker_recovered" &&
        watchdogAlertKind(alert.data) === kind
    )

    return {
      kind,
      enabled: control.enabled,
      paused: control.paused,
      updatedAt: control.updatedAt.toISOString(),
      label: WORKER_LABELS[kind],
      description: DESCRIPTIONS[kind],
      state,
      online,
      active,
      activeProcesses: liveHeartbeats.length,
      role:
        online && (meta.role === "leader" || meta.role === "standby")
          ? meta.role
          : null,
      startedAt: heartbeat?.startedAt.toISOString() ?? null,
      lastHeartbeatAt: heartbeat?.lastSeenAt.toISOString() ?? null,
      lastSuccessfulWorkAt:
        lastSuccessfulWorkAt ?? safeIso(meta.lastSuccessfulWorkAt),
      currentActivity,
      latestError: safeWorkerError(meta.latestError),
      userPaused: kind === "market-scanner" ? userPaused : null,
      watchdogLastCheckAt: online ? safeIso(meta.watchdogLastCheckAt) : null,
      lastIncidentAt: lastDown?.createdAt.toISOString() ?? null,
      lastIncidentOngoing:
        lastDown !== undefined &&
        (lastRecovered === undefined ||
          lastRecovered.createdAt < lastDown.createdAt),
      metrics: metricsFor(
        kind,
        meta,
        botCounts[0],
        backtests[0],
        marketStats,
        latestWhaleActivity
      ),
    }
  })

  return {
    checkedAt: checkedAt.toISOString(),
    canControl,
    workers,
    overview: {
      online: workers.filter((worker) => worker.online).length,
      active: workers.filter((worker) => worker.active).length,
      pausedOrOff: workers.filter((worker) => worker.paused || !worker.enabled)
        .length,
      needsAttention: workers.filter(
        (worker) => worker.state === "offline" || worker.latestError !== null
      ).length,
    },
  }
}

function metricsFor(
  kind: WorkerKind,
  meta: SafeMeta,
  botCounts: { waiting: number } | undefined,
  backtests:
    | { queued: number; running: number; lastCompletedAt: Date | null }
    | undefined,
  marketStats:
    | {
        enabled_rules: number | string
        markets: number | string
        last_evaluated_at: Date | string | null
      }
    | undefined,
  whaleActivity:
    | { activity_at: Date | string | null; activity_type: string | null }
    | undefined
) {
  if (kind === "bot") {
    const running = numberOf(meta.runningBots)
    return [
      { label: "Live bots", value: String(numberOf(meta.runningLiveBots)) },
      { label: "Paper bots", value: String(numberOf(meta.runningPaperBots)) },
      {
        label: "Waiting",
        value: String(Math.max(0, countOf(botCounts?.waiting) - running)),
      },
    ]
  }
  if (kind === "whale-scanner") {
    return [
      { label: "Subscriptions", value: String(numberOf(meta.subscriptions)) },
      {
        label: "Last collection",
        value: isoOf(whaleActivity?.activity_at) ?? "Never",
      },
      {
        label: "Latest type",
        value: whaleActivity?.activity_type ?? "None yet",
      },
    ]
  }
  if (kind === "market-scanner") {
    return [
      {
        label: "Enabled rules",
        value: String(countOf(marketStats?.enabled_rules)),
      },
      {
        label: "Markets",
        value: String(
          numberOf(meta.marketScannerCoins) || countOf(marketStats?.markets)
        ),
      },
      {
        label: "Last evaluation",
        value: isoOf(marketStats?.last_evaluated_at) ?? "Never",
      },
    ]
  }
  if (kind === "alert") {
    return [
      { label: "Alert rules", value: String(numberOf(meta.alertRules)) },
      { label: "Markets", value: String(numberOf(meta.alertCoins)) },
      {
        label: "Subscriptions",
        value: String(numberOf(meta.alertSubscriptions)),
      },
    ]
  }
  return [
    {
      label: "Queued",
      value: String(backtests?.queued ?? 0),
    },
    {
      label: "Running",
      value: String(backtests?.running ?? 0),
    },
    {
      label: "Current progress",
      value: `${numberOf(meta.currentJobProgress)}%`,
    },
    {
      label: "Last completed",
      value: isoOf(backtests?.lastCompletedAt) ?? "Never",
    },
  ]
}

function watchdogAlertKind(data: unknown) {
  const kind = metaOf(data).workerKind
  return typeof kind === "string" ? kind : null
}

function metaOf(value: unknown): SafeMeta {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as SafeMeta)
    : {}
}

function numberOf(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0
}

function countOf(value: unknown) {
  const count = typeof value === "string" ? Number(value) : value
  return typeof count === "number" && Number.isFinite(count) ? count : 0
}

function safeText<T extends string | null>(
  value: unknown,
  fallback: T
): string | T {
  return typeof value === "string" && value.trim()
    ? value.trim().replace(/\s+/g, " ").slice(0, 200)
    : fallback
}

function safeIso(value: unknown) {
  return isoOf(value)
}

function isoOf(value: unknown) {
  if (typeof value !== "string" && !(value instanceof Date)) return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isFinite(date.getTime()) ? date.toISOString() : null
}
