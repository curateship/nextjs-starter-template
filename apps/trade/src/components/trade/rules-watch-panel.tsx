import * as React from "react"
import {
  SettingsIcon,
  ShieldCheckIcon,
  TriangleAlertIcon,
} from "lucide-react"

import { useNoteTicks } from "@/components/trade/note-ticks"
import { RuleConditionLine } from "@/components/trade/rule-condition-line"
import { RuleNoteChecklist } from "@/components/trade/rule-note-checklist"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
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
const PICKED_RULE_KEY = "trade:rules-box-rule"

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
 * The Rules box that watches the switched-on rules, drawn the way Tyler
 * sketched it on 15 Oct 2026.
 *
 * It shows one switched-on rule at a time. The header picks which one, and
 * its cog opens that rule's settings window. The body counts what the rule
 * needs: a block, warnings, held trades that break it, and notes still to
 * tick. Under that, an amber card for each held trade that breaks it, failed
 * conditions first, and its notes under "Tick before you trade". There is no
 * fold arrow: Tyler took it off on 15 Oct 2026, so the body always shows.
 *
 * A held trade is only ever warned about. An entry that already happened
 * cannot be undone, and nothing here closes or cancels anything.
 *
 * Its own component so the price ticks it follows redraw this box and not the
 * chart under it.
 *
 * **It lives in the left panel** (Tyler, 15 Oct 2026), which the market
 * scanner used to fill. It fills the panel and stays on screen with nothing
 * to check, saying why. With the left panel shut it is not drawn at all; the
 * check before an entry still runs.
 */
export function RulesWatchPanel({
  marketKey,
  rules,
  holdings,
  factsFor,
  idleNote = null,
  onEditRule,
}: {
  /** Opens the rule's settings window. Without it there is no cog. */
  onEditRule?: (ruleId: string) => void
  marketKey: string
  rules: TradingRules
  holdings: readonly RuleHolding[]
  /** Why nothing is checked right now, such as a practice wallet. */
  idleNote?: string | null
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
  const ticked = useNoteTicks(marketKey)
  const [pickedId, pick] = usePickedRule()

  React.useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), TICK_MS)
    return () => window.clearInterval(timer)
  }, [])

  const switchedOn = rules.list.filter((rule) => rule.on)
  const shellClass = "flex min-h-0 w-full flex-1 flex-col text-sm"
  if (switchedOn.length === 0 || idleNote) {
    return (
      <div data-rules-box className={shellClass}>
        <div className="flex h-12 w-full items-center gap-2 px-4">
          <ShieldCheckIcon className="size-4 shrink-0 text-muted-foreground" />
          <span className="font-semibold">Rules</span>
        </div>
        <p className="border-t px-4 py-3 text-xs text-muted-foreground">
          {idleNote ??
            "No trading rules are switched on. Turn one on in Settings, Trading rules."}
        </p>
      </div>
    )
  }

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

  const current =
    sections.find((one) => one.rule.id === pickedId) ?? sections[0]
  const attention = attentionOf(current, ticked)
  // A rule not on screen can still block the next entry, so the box says how
  // many of the others want a look rather than leaving them unseen.
  const othersNeedingLook = sections.filter(
    (one) => one !== current && attentionOf(one, ticked).needsLook
  ).length

  return (
    <div data-rules-box className={shellClass}>
      {/* The header picks the rule and edits it (Tyler, 15 Oct 2026). The
          counts that used to sit here are in the body, under it. */}
      <div className="flex h-12 w-full items-center gap-2 px-4">
        <ShieldCheckIcon className="size-4 shrink-0 text-muted-foreground" />
        <span className="font-semibold">Rules</span>
        <Select value={current.rule.id} onValueChange={pick}>
          <SelectTrigger
            aria-label="Rule shown"
            className="ml-auto w-auto max-w-48 min-w-0 flex-1 justify-between"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper" align="end">
            {sections.map((one) => (
              <SelectItem key={one.rule.id} value={one.rule.id}>
                {one.rule.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {onEditRule ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`Edit ${current.rule.name}`}
            onClick={() => onEditRule(current.rule.id)}
          >
            <SettingsIcon />
          </Button>
        ) : null}
      </div>

      <ScrollArea className="min-h-0 flex-1 border-t">
        <RuleSection
          marketKey={marketKey}
          {...current}
          chips={
            <>
              {current.entry.blocks ? (
                <Badge className={LOST_MONEY_SURFACE}>Blocking</Badge>
              ) : null}
              {attention.warning > 0 ? (
                <Badge className={WARNING_SURFACE}>
                  {plural(attention.warning, "warning")}
                </Badge>
              ) : null}
              {current.entry.state === "unknown" ? (
                <Badge variant="secondary">Can't tell yet</Badge>
              ) : null}
              {attention.toTick > 0 ? (
                <Badge variant="secondary">{attention.toTick} to tick</Badge>
              ) : null}
              {!attention.needsLook ? (
                <Badge className={MADE_MONEY_SURFACE}>All clear</Badge>
              ) : null}
            </>
          }
          others={othersNeedingLook}
        />
      </ScrollArea>
    </div>
  )
}

type Section = {
  rule: TradingRule
  entry: RuleResult
  broken: { held: RuleHolding; result: RuleResult }[]
  notes: ReturnType<typeof notesOf>
}

/** What one rule wants looked at: warnings, notes to tick, a block. */
function attentionOf(section: Section, ticked: ReadonlySet<string>) {
  const warning =
    (!section.entry.blocks && section.entry.state === "yes" ? 1 : 0) +
    section.broken.length
  const toTick = section.notes.filter((note) => !ticked.has(note.key)).length
  return {
    warning,
    toTick,
    needsLook:
      section.entry.blocks ||
      warning > 0 ||
      toTick > 0 ||
      section.entry.state === "unknown",
  }
}

/** The rule last picked in the box, remembered in this browser. */
function usePickedRule() {
  const [picked, setPicked] = React.useState<string | null>(() => {
    try {
      return window.localStorage.getItem(PICKED_RULE_KEY)
    } catch {
      return null
    }
  })
  const pick = React.useCallback((id: string) => {
    setPicked(id)
    try {
      window.localStorage.setItem(PICKED_RULE_KEY, id)
    } catch {
      // Without storage the pick still holds for this visit.
    }
  }, [])
  return [picked, pick] as const
}

/**
 * The rule on screen: its name, then the chips that count what it needs and
 * how many conditions it has (Tyler, 15 Oct 2026: "move the 2 chip before the
 * rules"), then the held trades that break it and its notes.
 */
function RuleSection({
  marketKey,
  rule,
  entry,
  broken,
  notes,
  chips,
  others,
}: Section & { marketKey: string; chips: React.ReactNode; others: number }) {
  const attention = entry.blocks
    ? LOST_MONEY
    : entry.state === "yes" || broken.length > 0
      ? WARNING
      : "text-muted-foreground"
  return (
    <section className="grid gap-3 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
        <h3 className="min-w-0 truncate font-semibold">{rule.name}</h3>
        <span className="ml-auto flex flex-wrap items-center justify-end gap-1.5">
          {chips}
          <span className={cn("shrink-0", attention)}>
            {plural(rule.cards.length, "rule")}
          </span>
        </span>
      </div>
      {others > 0 ? (
        <p className="text-xs text-muted-foreground">
          {plural(others, "other rule")} also{" "}
          {others === 1 ? "needs" : "need"} a look. Pick it from the list
          above.
        </p>
      ) : null}
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
