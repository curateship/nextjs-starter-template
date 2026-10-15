import * as React from "react"
import { ChevronDownIcon, ShieldCheckIcon, TriangleAlertIcon } from "lucide-react"

import { useNoteTicks } from "@/components/trade/note-ticks"
import { RuleConditionLine } from "@/components/trade/rule-condition-line"
import { RuleNoteChecklist } from "@/components/trade/rule-note-checklist"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useLiveFigures } from "@/lib/trade/live-market"
import {
  LOST_MONEY,
  LOST_MONEY_SURFACE,
  MADE_MONEY_SURFACE,
  WARNING,
  WARNING_SURFACE,
} from "@/lib/trade/money-tone"
import {
  judgeRule,
  notesOf,
  ruleCovers,
  type CardResult,
  type RuleEntry,
  type RuleFacts,
  type RuleResult,
  type TradingRule,
  type TradingRules,
} from "@/lib/trade/trading-rules"
import { cn } from "@/lib/utils"

/** A trade already held on the coin on screen, checked against the rules. */
export type RuleHolding = {
  id: string
  coin: string
  /** "grid", "DCA ladder", "long", "short". */
  kind: string
  /** The wallet's name, or null when the page does not know it. */
  wallet: string | null
  entry: RuleEntry
  walletId: string
  /** The held trade is a running grid, so the grid counts leave it out. */
  grid: boolean
  /** The held trade has a position, so the position count leaves it out. */
  position: boolean
}

const TICK_MS = 1_000

/** Failed conditions first, then the ones that cannot tell, then the ones that hold. */
const STATE_ORDER: Record<CardResult["state"], number> = {
  no: 0,
  unknown: 1,
  yes: 2,
}

function failedFirst(cards: readonly CardResult[]): CardResult[] {
  return [...cards].sort(
    (left, right) => STATE_ORDER[left.state] - STATE_ORDER[right.state]
  )
}

function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`
}

/**
 * The small box on the chart that watches the switched-on rules, drawn the
 * way Tyler sketched it on 15 Oct 2026.
 *
 * The header counts what needs attention: rules that would block or warn,
 * held trades that break a rule, and notes still to tick. Under it, one
 * section per rule that has something to show: an amber card for each held
 * trade that breaks it, failed conditions first, and its notes under "Tick
 * before you trade". The arrow folds all of it away and leaves the header.
 *
 * A held trade is only ever warned about. An entry that already happened
 * cannot be undone, and nothing here closes or cancels anything.
 *
 * Its own component so the price ticks it follows redraw this box and not the
 * chart under it.
 */
export function RulesWatchPanel({
  marketKey,
  rules,
  holdings,
  factsFor,
}: {
  marketKey: string
  rules: TradingRules
  holdings: readonly RuleHolding[]
  /** What the cards read, for an entry (`held` null) or for a held trade. */
  factsFor: (
    price: number | null,
    now: number,
    held: RuleHolding | null
  ) => RuleFacts
}) {
  const live = useLiveFigures(marketKey)
  const price = live?.price ?? null
  const [now, setNow] = React.useState(() => Date.now())
  const [open, setOpen] = React.useState(true)
  const bodyId = React.useId()
  const ticked = useNoteTicks(marketKey)

  React.useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), TICK_MS)
    return () => window.clearInterval(timer)
  }, [])

  const switchedOn = rules.list.filter((rule) => rule.on)
  if (switchedOn.length === 0) return null

  const entryFacts = factsFor(price, now, null)
  const heldFacts = new Map(
    holdings.map((held) => [held.id, factsFor(price, now, held)])
  )
  const sections = switchedOn.map((rule) => {
    const entry = judgeRule(rule, entryFacts)
    const broken = holdings.flatMap((held) => {
      if (!ruleCovers(rule, held.entry)) return []
      const facts = heldFacts.get(held.id)
      if (!facts) return []
      const result = judgeRule(rule, facts)
      return result.state === "yes" ? [{ held, result }] : []
    })
    return { rule, entry, broken, notes: notesOf(rule) }
  })

  const blocking = sections.filter((one) => one.entry.blocks).length
  const warning = sections.filter(
    (one) =>
      !one.entry.blocks && (one.entry.state === "yes" || one.broken.length > 0)
  ).length
  const unknown = sections.filter((one) => one.entry.state === "unknown").length
  const toTick = sections
    .flatMap((one) => one.notes)
    .filter((note) => !ticked.has(note.key)).length
  const shown = sections.filter(
    (one) => one.broken.length > 0 || one.notes.length > 0
  )

  return (
    <div className="pointer-events-auto absolute top-2 left-2 z-20 w-96 max-w-[calc(100%-1rem)] overflow-hidden rounded-xl border bg-card text-sm shadow-sm">
      <button
        type="button"
        className="flex h-12 w-full items-center gap-2 px-4 text-left hover:bg-muted/40"
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={() => setOpen((was) => !was)}
      >
        <ShieldCheckIcon className="size-4 shrink-0 text-muted-foreground" />
        <span className="font-semibold">Rules</span>
        <span className="ml-auto flex min-w-0 flex-wrap justify-end gap-1.5">
          {blocking > 0 ? (
            <Badge className={LOST_MONEY_SURFACE}>{blocking} blocking</Badge>
          ) : null}
          {warning > 0 ? (
            <Badge className={WARNING_SURFACE}>
              {plural(warning, "warning")}
            </Badge>
          ) : null}
          {unknown > 0 ? (
            <Badge variant="secondary">{unknown} can't tell</Badge>
          ) : null}
          {toTick > 0 ? (
            <Badge variant="secondary">{toTick} to tick</Badge>
          ) : null}
          {blocking + warning + unknown + toTick === 0 ? (
            <Badge className={MADE_MONEY_SURFACE}>All clear</Badge>
          ) : null}
        </span>
        <ChevronDownIcon
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none",
            open && "rotate-180"
          )}
        />
      </button>

      {open && shown.length > 0 ? (
        <ScrollArea className="max-h-[28rem] border-t">
          <div id={bodyId} className="divide-y">
            {shown.map((section) => (
              <RuleSection
                key={section.rule.id}
                marketKey={marketKey}
                {...section}
              />
            ))}
          </div>
        </ScrollArea>
      ) : null}
    </div>
  )
}

function RuleSection({
  marketKey,
  rule,
  entry,
  broken,
  notes,
}: {
  marketKey: string
  rule: TradingRule
  entry: RuleResult
  broken: { held: RuleHolding; result: RuleResult }[]
  notes: ReturnType<typeof notesOf>
}) {
  const attention = entry.blocks
    ? LOST_MONEY
    : entry.state === "yes" || broken.length > 0
      ? WARNING
      : "text-muted-foreground"
  return (
    <section className="grid gap-3 px-4 py-3">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="min-w-0 truncate font-semibold">{rule.name}</h3>
        <span className={cn("shrink-0", attention)}>
          {plural(rule.cards.length, "rule")}
        </span>
      </div>

      {broken.map(({ held, result }) => (
        <div
          key={held.id}
          role="status"
          className={cn(
            "grid gap-2 rounded-lg border border-amber-500/25 px-3 py-2.5",
            WARNING_SURFACE
          )}
        >
          <p className="flex items-center gap-2">
            <TriangleAlertIcon className="size-4 shrink-0" />
            <span className="min-w-0">
              Your <strong>{held.coin}</strong> {held.kind}
              {held.wallet ? (
                <>
                  {" "}
                  on <strong>{held.wallet}</strong>
                </>
              ) : null}
            </span>
          </p>
          {failedFirst(result.allCards).map((card, index) => (
            <RuleConditionLine
              key={index}
              card={card}
              className={cn(
                "pl-6 text-foreground",
                card.state === "yes" && "text-muted-foreground"
              )}
            />
          ))}
        </div>
      ))}

      {notes.length > 0 ? (
        // Clear of the amber card above, so the list reads as its own part.
        <div className={cn("grid gap-2", broken.length > 0 && "mt-2")}>
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Tick before you trade
          </p>
          <RuleNoteChecklist
            marketKey={marketKey}
            notes={notes}
            showRuleNames={false}
          />
        </div>
      ) : null}
    </section>
  )
}
