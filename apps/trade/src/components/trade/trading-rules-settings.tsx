import * as React from "react"

import { useTradePageTitle } from "@/app/page-title"
import { useTradeSettingsBootstrap } from "@/components/trade/trade-settings-context"
import { useTradingRules } from "@/components/trade/use-trading-rules"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardFooter, CardGroup } from "@/components/ui/card"
import { FieldLabel } from "@/components/ui/field-label"
import { NumberField } from "@/components/ui/number-field"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import {
  getTradingRulesLoadErrorMessage,
  loadTradingRulesSettings,
} from "@/lib/api/trade/trading-rules"
import { showErrorToast } from "@/lib/toast/error-toast"
import {
  RULE_LINE_KINDS,
  RULE_SIDES,
  type RuleLineKind,
  type RuleSide,
  type TradingRules,
} from "@/lib/trade/trading-rules"

const SIDE_LABELS: Record<RuleSide, string> = {
  both: "Longs and shorts",
  longs: "Longs only",
  shorts: "Shorts only",
}

const LINE_KIND_LABELS: Record<RuleLineKind, string> = {
  either: "Trendlines or levels",
  trendline: "Trendlines only",
  level: "Levels only",
}

/**
 * The Trading rules tab: three rules a person sets for themselves before a
 * real-money entry, one card each. The switch sits to the left of the title,
 * and a rule that is on shows its number and choices in the strip along the
 * bottom of its card, saved as they change. None of them blocks a trade; an
 * unmet rule opens a warning on the chart that has to be confirmed.
 */
export default function TradingRulesSettings() {
  useTradePageTitle("Settings")
  const bootstrap = useTradeSettingsBootstrap()
  const initial = bootstrap?.tradingRules
  const [loaded, setLoaded] = React.useState<TradingRules | null>(
    initial ?? null
  )
  const [loadFailed, setLoadFailed] = React.useState(false)

  const load = React.useCallback(() => {
    loadTradingRulesSettings()
      .then(({ rules }) => {
        setLoaded(rules)
        setLoadFailed(false)
      })
      .catch((error: unknown) => {
        setLoadFailed(true)
        showErrorToast(getTradingRulesLoadErrorMessage(error))
      })
  }, [])

  React.useEffect(() => {
    if (initial === undefined) load()
  }, [initial, load])

  if (loaded === null) {
    return (
      <Card>
        <CardContent className="flex items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            {loadFailed
              ? "Your trading rules could not be loaded."
              : "Loading your trading rules…"}
          </p>
          {loadFailed ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setLoadFailed(false)
                load()
              }}
            >
              Try again
            </Button>
          ) : null}
        </CardContent>
      </Card>
    )
  }

  return <TradingRulesCards initial={loaded} />
}

function TradingRulesCards({ initial }: { initial: TradingRules }) {
  const { rules, setRule } = useTradingRules(initial)

  return (
    <CardGroup>
      <RuleCard
        id="rule-lines"
        title="Lines on the chart"
        description="At least this many lines above the price and the same number below it, on this coin. A line exactly on the price counts for neither side."
        on={rules.lines.on}
        onToggle={(on) => setRule("lines", { on })}
      >
        <NumberField
          id="rule-lines-count"
          label="Lines above and below"
          value={rules.lines.count}
          min={1}
          max={20}
          inputClassName="w-24"
          onChange={(count) => setRule("lines", { count })}
        />
        <ChoiceField
          id="rule-lines-kinds"
          label="What counts"
          value={rules.lines.kinds}
          options={RULE_LINE_KINDS}
          labels={LINE_KIND_LABELS}
          onChange={(kinds) => setRule("lines", { kinds })}
        />
        <ChoiceField
          id="rule-lines-applies"
          label="Applies to"
          value={rules.lines.applies}
          options={RULE_SIDES}
          labels={SIDE_LABELS}
          onChange={(applies) => setRule("lines", { applies })}
        />
      </RuleCard>

      <RuleCard
        id="rule-time-on-chart"
        title="Time on this chart"
        description="At least this many minutes since you switched to this coin. Leaving for another coin and coming back starts the clock again, and so does a reload."
        on={rules.timeOnChart.on}
        onToggle={(on) => setRule("timeOnChart", { on })}
      >
        <NumberField
          id="rule-time-on-chart-minutes"
          label="Minutes on the chart"
          value={rules.timeOnChart.minutes}
          min={1}
          max={1440}
          inputClassName="w-24"
          onChange={(minutes) => setRule("timeOnChart", { minutes })}
        />
        <ChoiceField
          id="rule-time-on-chart-applies"
          label="Applies to"
          value={rules.timeOnChart.applies}
          options={RULE_SIDES}
          labels={SIDE_LABELS}
          onChange={(applies) => setRule("timeOnChart", { applies })}
        />
      </RuleCard>

      <RuleCard
        id="rule-last-order"
        title="Time since the last order"
        description="At least this many minutes since your last order on this coin, counting the orders and fills the chart can see."
        on={rules.timeSinceLastOrder.on}
        onToggle={(on) => setRule("timeSinceLastOrder", { on })}
      >
        <NumberField
          id="rule-last-order-minutes"
          label="Minutes between orders"
          value={rules.timeSinceLastOrder.minutes}
          min={1}
          max={1440}
          inputClassName="w-24"
          onChange={(minutes) => setRule("timeSinceLastOrder", { minutes })}
        />
        <ChoiceField
          id="rule-last-order-applies"
          label="Applies to"
          value={rules.timeSinceLastOrder.applies}
          options={RULE_SIDES}
          labels={SIDE_LABELS}
          onChange={(applies) => setRule("timeSinceLastOrder", { applies })}
        />
      </RuleCard>
    </CardGroup>
  )
}

/**
 * One rule: its switch to the left of the title, the description under the
 * title, and, only while the rule is on, its number and choices in the muted
 * strip along the bottom, lined up under the title. A rule that is off has
 * nothing to set, so it shows nothing to set.
 */
function RuleCard({
  id,
  title,
  description,
  on,
  onToggle,
  children,
}: {
  id: string
  title: string
  description: string
  on: boolean
  onToggle: (on: boolean) => void
  children: React.ReactNode
}) {
  return (
    <Card>
      <CardContent className="flex items-start gap-4">
        <Switch
          id={id}
          checked={on}
          aria-label={title}
          className="mt-0.5"
          onCheckedChange={onToggle}
        />
        <div className="grid min-w-0 gap-1">
          <label htmlFor={id} className="font-heading text-base font-medium">
            {title}
          </label>
          <p className="max-w-2xl text-sm text-muted-foreground">
            {description}
          </p>
        </div>
      </CardContent>
      {on ? (
        <CardFooter>
          {/* Indented by the switch's width and the gap, so the first box
              starts under the first letter of the title. */}
          <div className="flex flex-wrap items-end gap-4 pl-15">{children}</div>
        </CardFooter>
      ) : null}
    </Card>
  )
}

function ChoiceField<T extends string>({
  id,
  label,
  value,
  options,
  labels,
  onChange,
}: {
  id: string
  label: string
  value: T
  options: readonly T[]
  labels: Record<T, string>
  onChange: (value: T) => void
}) {
  return (
    <div className="grid gap-2">
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Select value={value} onValueChange={(next) => onChange(next as T)}>
        <SelectTrigger id={id} className="w-fit">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option} value={option}>
              {labels[option]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
