import * as React from "react"
import {
  ChevronDownIcon,
  SettingsIcon,
  ShieldCheckIcon,
  TriangleAlertIcon,
} from "lucide-react"

import { useCardFold } from "@/components/trade/card-folds-store"
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
 * to check, saying why. With the left panel shut it is not drawn; the
 * `RulesChartCard` below sums it up over the chart instead, and the check
 * before an entry still runs.
 */
export function RulesWatchPanel({
  marketKey,
  rules,
  holdings,
  factsFor,
  idleNote = null,
  onEditRule,
  bare = false,
}: {
  /**
   * In the dashboard's Rules block, whose heading already says Rules, so the
   * box drops its own shield and title and keeps the rule picker and cog.
   */
  bare?: boolean
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
  const { switchedOn, sections, ticked } = useRuleSections({
    marketKey,
    rules,
    holdings,
    factsFor,
  })
  const [pickedId, pick] = usePickedRule()

  const shellClass = "flex min-h-0 w-full flex-1 flex-col text-sm"
  if (switchedOn.length === 0 || idleNote) {
    return (
      <div data-rules-box className={shellClass}>
        {bare ? null : (
          <div className="flex h-12 w-full items-center gap-2 px-4">
            <ShieldCheckIcon className="size-4 shrink-0 text-muted-foreground" />
            <span className="font-semibold">Rules</span>
          </div>
        )}
        <p className={cn("px-4 py-3 text-xs text-muted-foreground", !bare && "border-t")}>
          {idleNote ??
            "No trading rules are switched on. Turn one on in Settings, Trading rules."}
        </p>
      </div>
    )
  }

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
        {bare ? null : (
          <>
            <ShieldCheckIcon className="size-4 shrink-0 text-muted-foreground" />
            <span className="font-semibold">Rules</span>
          </>
        )}
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

type FactsFor = (
  price: number | null,
  now: number,
  held: RuleHolding | null
) => RuleFacts

/**
 * Every switched-on rule judged against the price on screen and the trades
 * already held, once a second. The left panel's Rules box and the summary
 * card on the chart both read this, so the two never disagree.
 */
function useRuleSections({
  marketKey,
  rules,
  holdings,
  factsFor,
}: {
  marketKey: string
  rules: TradingRules
  holdings: readonly RuleHolding[]
  factsFor: FactsFor
}) {
  const live = useLiveFigures(marketKey)
  const price = live?.price ?? null
  const [now, setNow] = React.useState(() => Date.now())
  const ticked = useNoteTicks(marketKey)

  React.useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), TICK_MS)
    return () => window.clearInterval(timer)
  }, [])

  const switchedOn = rules.list.filter((rule) => rule.on)
  const entryFacts = factsFor(price, now, null)
  const heldFacts = new Map(
    holdings.map((held) => [held.id, factsFor(price, now, held)])
  )
  const sections: Section[] = switchedOn.map((rule) => {
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
  return { switchedOn, sections, ticked }
}

const RULES_CARD_FOLD_ID = "rules-chart-card"

/** A rule's name in the chart card; pressing it opens the rule's settings. */
function RuleName({
  section,
  onEditRule,
  className,
}: {
  section: Section
  onEditRule?: (ruleId: string) => void
  className?: string
}) {
  if (!onEditRule) {
    return (
      <span className={cn("min-w-0 truncate", className)}>
        {section.rule.name}
      </span>
    )
  }
  return (
    <button
      type="button"
      className={cn(
        "min-w-0 truncate rounded-sm text-left hover:underline",
        className
      )}
      onClick={() => onEditRule(section.rule.id)}
    >
      {section.rule.name}
    </button>
  )
}

/**
 * A rule's conditions, each with its tick, cross or question mark and the
 * failed ones first, then its notes to tick (Tyler, 31 Oct 2026: "show me the
 * rules thats ticked and the notes too").
 */
function RuleBody({
  section,
  marketKey,
}: {
  section: Section
  marketKey: string
}) {
  return (
    <>
      {failedFirst(section.entry.allCards).map((card, index) => (
        <RuleConditionLine key={index} card={card} className="px-1 text-xs" />
      ))}
      {section.notes.length > 0 ? (
        <RuleNoteChecklist
          marketKey={marketKey}
          notes={section.notes}
          showRuleNames={false}
          className="px-1 pt-1"
        />
      ) : null}
    </>
  )
}

/** How bad a rule's chip is: Blocking 0 down to All clear 4. */
function severityOf(section: Section, ticked: ReadonlySet<string>): number {
  const attention = attentionOf(section, ticked)
  if (section.entry.blocks) return 0
  if (attention.warning > 0) return 1
  if (section.entry.state === "unknown") return 2
  if (attention.toTick > 0) return 3
  return 4
}

/** The one chip that says most about a rule, worst first. */
function SummaryChip({
  section,
  ticked,
}: {
  section: Section
  ticked: ReadonlySet<string>
}) {
  const attention = attentionOf(section, ticked)
  switch (severityOf(section, ticked)) {
    case 0:
      return <Badge className={LOST_MONEY_SURFACE}>Blocking</Badge>
    case 1:
      return (
        <Badge className={WARNING_SURFACE}>
          {plural(attention.warning, "warning")}
        </Badge>
      )
    case 2:
      return <Badge variant="secondary">Can't tell yet</Badge>
    case 3:
      return <Badge variant="secondary">{attention.toTick} to tick</Badge>
    default:
      return <Badge className={MADE_MONEY_SURFACE}>All clear</Badge>
  }
}

/**
 * The rules in one small card over the chart's top-left corner, for when the
 * left panel, and the Rules box in it, is shut (Tyler, 31 Oct 2026). The
 * worst switched-on rule's name is the title, with its chip and a fold arrow
 * that shows under the pointer; pressing the title row folds the card. Under
 * it, the rule's conditions and notes to tick, then any other switched-on
 * rule the same way under its own name, which opens that rule's settings.
 * Edit rule at the foot opens the title rule's. Ticks here and in the Rules
 * box are the same ticks. It draws nothing when no rule is on, and Settings,
 * Trading rules, "Card on chart" hides it.
 */
export function RulesChartCard({
  marketKey,
  rules,
  holdings,
  factsFor,
  idleNote = null,
  onEditRule,
}: {
  marketKey: string
  rules: TradingRules
  holdings: readonly RuleHolding[]
  factsFor: FactsFor
  idleNote?: string | null
  onEditRule?: (ruleId: string) => void
}) {
  const { sections, ticked } = useRuleSections({
    marketKey,
    rules,
    holdings,
    factsFor,
  })
  // Remembered against the account, like every other folded card here.
  const [open, setOpen] = useCardFold(RULES_CARD_FOLD_ID, true)
  if (sections.length === 0) return null
  // Worst rule first. Its name is the card's title (Tyler, 31 Oct 2026:
  // "Replace the Rules text with the rules name itself") with its chip beside
  // it ("move the blocking chip here"). Any other rule follows with its own.
  const [lead, ...rest] = [...sections].sort(
    (left, right) => severityOf(left, ticked) - severityOf(right, ticked)
  )

  return (
    <div
      data-rules-chart-card
      className="group/rules-card absolute top-3 left-3 z-10 grid max-h-[calc(100%-1.5rem)] w-72 max-w-[calc(100%-1.5rem)] content-start gap-2 overflow-y-auto rounded-lg border bg-popover p-2 text-sm shadow-sm"
    >
      {/* The whole title row folds and opens the card (Tyler, 31 Oct 2026:
          "pressing the whole header should collapsed or uncollapse the
          card"). The arrow shows only under the pointer, and to the
          keyboard when the row has focus. */}
      <button
        type="button"
        aria-expanded={open}
        className="flex min-h-8 w-full items-center gap-2 rounded-md px-1 text-left"
        onClick={() => setOpen(!open)}
      >
        <ShieldCheckIcon className="size-4 shrink-0 text-muted-foreground" />
        <span className="min-w-0 truncate font-semibold">{lead.rule.name}</span>
        {idleNote ? null : <SummaryChip section={lead} ticked={ticked} />}
        <ChevronDownIcon
          aria-hidden
          className={cn(
            "ml-auto size-4 shrink-0 text-muted-foreground opacity-0 transition group-hover/rules-card:opacity-100 group-focus-within/rules-card:opacity-100",
            !open && "-rotate-90"
          )}
        />
      </button>
      {!open ? null : idleNote ? (
        <p className="px-1 text-xs text-muted-foreground">{idleNote}</p>
      ) : (
        <>
          <RuleBody section={lead} marketKey={marketKey} />
          {rest.map((section) => (
            <section
              key={section.rule.id}
              className="grid gap-1.5 border-t pt-2"
            >
              <div className="flex min-h-8 items-center justify-between gap-2 px-1">
                <RuleName
                  section={section}
                  onEditRule={onEditRule}
                  className="font-medium"
                />
                <SummaryChip section={section} ticked={ticked} />
              </div>
              <RuleBody section={section} marketKey={marketKey} />
            </section>
          ))}
        </>
      )}
      {/* The rule's settings window from the card's foot (Tyler, 31 Oct
          2026: "Add a button in the footer to open up the rule modal"). */}
      {open && onEditRule ? (
        <div className="px-1 pt-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() => onEditRule(lead.rule.id)}
          >
            <SettingsIcon />
            Edit rule
          </Button>
        </div>
      ) : null}
    </div>
  )
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
