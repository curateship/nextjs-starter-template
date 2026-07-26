/**
 * Creates the QFL / DCA automations from the July 2026 campaign as real, editable
 * automations, so their settings can be inspected and re-run in the app instead
 * of only existing as a candidate JSON blob in a script.
 *
 * Usage (from apps/trading):  npx tsx scripts/make-qfl-automation.ts
 */
import { readFileSync } from "node:fs"
for (const line of readFileSync(
  new URL("../.env.local", import.meta.url),
  "utf8"
).split("\n")) {
  const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line)
  if (match) process.env[match[1]] ??= match[2].trim().replace(/^["']|["']$/g, "")
}

const { eq } = await import("drizzle-orm")
const { db } = await import("@/server/db")
const { customShellUsers } = await import("@/server/schema")
const { createUserAutomation, saveUserAutomation } = await import(
  "@/server/automations"
)
const { and, eq: eqOp } = await import("drizzle-orm")
const { tradingAutomations } = await import("@/server/schema")
const { compileAutomationGraph } = await import("@/lib/automations/automation")
type AutomationGraph = import("@/lib/automations/automation").AutomationGraph
type AutomationNode = import("@/lib/automations/automation").AutomationNode
type AutomationInterval =
  import("@/lib/automations/automation").AutomationInterval

type Spec = {
  name: string
  interval: AutomationInterval
  basePeriods: number
  pumpPeriods: number
  crackPct: number
  maxCrackBars: number
  rungs: number[]
  maxPositionPct: number
  sizeMultiplier: number
  rungEntry: "market" | "limit"
  tpMode: "average" | "previousRungSellAll" | "nearestRungSellAll" | "moneyBackThenBase"
  takeProfitPct: number
  stopLossPct: number
  stopAnchor: "average" | "first"
  confirmPriceActionReversals: number | null
}

/** The Price Action reversal confirmation the campaign searched with. */
const PA_REVERSAL_PARAMS = {
  bullHammer: true,
  bearShootingStar: true,
  bullEngulfing: true,
  bearEngulfing: true,
  bullSweep: false,
  bearSweep: false,
  bullBos: false,
  bearBos: false,
  wickBodyRatio: 2,
  extremeLookback: 20,
  sweepLookback: 20,
  swingLookback: 20,
}

function graphFor(spec: Spec): AutomationGraph {
  const nodes: AutomationNode[] = [
    {
      id: "base",
      kind: "indicator",
      x: 40,
      y: 160,
      indicator: {
        type: "base",
        params: {
          basePeriods: spec.basePeriods,
          pumpPeriods: spec.pumpPeriods,
          formedMinBars: 20,
          formedShowLong: true,
          formedShowShort: true,
          formedRequireHigherBase: true,
        },
      },
    },
    {
      id: "dca",
      kind: "dca",
      x: 360,
      y: 160,
      rungs: spec.rungs.map((deviation) => ({ deviation })),
      maxPositionPct: spec.maxPositionPct,
      sizeMultiplier: spec.sizeMultiplier,
      compound: true,
      rungEntry: spec.rungEntry,
      requireTwoGreen: false,
      crackPct: spec.crackPct,
      maxCrackBars: spec.maxCrackBars,
      respectFilterEnabled: false,
      respectLookbackMonths: 6,
      minRespectPct: 80,
      recoveryTargetPct: -2,
      sellBelowBasePct: 2,
      trendFilterEnabled: false,
      trendMaBars: 200,
      exitOnTrendBreak: false,
      maxCycleBars: 0,
    },
    {
      id: "tp",
      kind: "takeProfit",
      x: 680,
      y: 90,
      pct: spec.takeProfitPct,
      ...(spec.tpMode !== "average" ? { mode: spec.tpMode } : {}),
    },
    {
      id: "sl",
      kind: "stopLoss",
      x: 680,
      y: 240,
      pct: spec.stopLossPct,
      ...(spec.stopAnchor === "first" ? { anchor: "first" as const } : {}),
    },
  ]
  const edges = [
    { id: "e-base", from: "base", sourcePort: "bullish" as const, to: "dca" },
    { id: "e-tp", from: "dca", sourcePort: "tp" as const, to: "tp" },
    { id: "e-sl", from: "dca", sourcePort: "sl" as const, to: "sl" },
  ]
  if (spec.confirmPriceActionReversals !== null) {
    nodes.push({
      id: "pa",
      kind: "indicator",
      x: 40,
      y: 340,
      indicator: { type: "price_action", params: PA_REVERSAL_PARAMS },
    })
    nodes.push({
      id: "pa-age",
      kind: "lookback",
      x: 200,
      y: 340,
      bars: spec.confirmPriceActionReversals,
    })
    edges.push(
      { id: "e-pa", from: "pa", sourcePort: "trend" as const, to: "pa-age" },
      { id: "e-pa-dca", from: "pa-age", sourcePort: "trend" as const, to: "dca" }
    )
  }
  return { nodes, edges, viewport: { x: 0, y: 0, zoom: 1 } }
}

const SPECS: Spec[] = [
  {
    // The only candidate that survived its out-of-sample window (-0.50%/mo in
    // the Sep-2025 -> Jul-2026 crash, while the same coins held lost 46%).
    name: "QFL 1d — campaign winner",
    interval: "1d",
    basePeriods: 36,
    pumpPeriods: 12,
    crackPct: 3.5,
    maxCrackBars: 2,
    rungs: [7, 8, 9, 10, 11],
    maxPositionPct: 50,
    sizeMultiplier: 3,
    rungEntry: "limit",
    tpMode: "nearestRungSellAll",
    takeProfitPct: 8,
    stopLossPct: 50,
    stopAnchor: "first",
    confirmPriceActionReversals: null,
  },
  {
    // Looked best on the tuning windows (+6.58%/mo train, +6.08%/mo validate)
    // and then lost 2.77%/month out of sample. Kept as the worked example of
    // what an overfit result looks like.
    name: "QFL 4h — overfit example",
    interval: "4h",
    basePeriods: 48,
    pumpPeriods: 8,
    crackPct: 2.5,
    maxCrackBars: 6,
    rungs: [3, 4, 5, 6, 7],
    maxPositionPct: 100,
    sizeMultiplier: 2,
    rungEntry: "limit",
    tpMode: "nearestRungSellAll",
    takeProfitPct: 3,
    stopLossPct: 50,
    stopAnchor: "first",
    confirmPriceActionReversals: 5,
  },
]

const [user] = await db
  .select({ id: customShellUsers.id })
  .from(customShellUsers)
  .where(eq(customShellUsers.email, "typham2@gmail.com"))
  .limit(1)
if (!user) throw new Error("User not found")

for (const spec of SPECS) {
  const graph = graphFor(spec)
  const check = compileAutomationGraph({ interval: spec.interval, graph })
  if (check.errors.length > 0) {
    console.log("INVALID", spec.name, JSON.stringify(check.errors))
    continue
  }
  // Re-runnable: replace any automation of the same name rather than colliding
  // on the unique-name constraint.
  await db
    .delete(tradingAutomations)
    .where(
      and(
        eqOp(tradingAutomations.userId, user.id),
        eqOp(tradingAutomations.name, spec.name)
      )
    )
  const created = await createUserAutomation(user.id, {
    name: spec.name,
    type: "QFL",
    interval: spec.interval,
  })
  await saveUserAutomation(user.id, created.id, {
    name: spec.name,
    type: "QFL",
    interval: spec.interval,
    graph,
  })
  console.log("CREATED", created.id, spec.name)
}
process.exit(0)
