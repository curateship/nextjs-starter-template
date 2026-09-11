import * as React from "react"

import { useTradePageTitle } from "@/app/page-title"
import { useTradeSettingsBootstrap } from "@/components/trade/trade-settings-context"
import { Card, CardContent, CardFooter, CardGroup } from "@/components/ui/card"
import { FieldLabel } from "@/components/ui/field-label"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import {
  getGoalLoadErrorMessage,
  getGoalSaveErrorMessage,
  loadGoalWallets,
  saveGoalSetting,
} from "@/lib/api/trade/goal"
import { showErrorToast } from "@/lib/toast/error-toast"
import {
  GOAL_MODES,
  GOAL_MODE_LABELS,
  goalSource,
  goalTarget,
  type Goal,
  type GoalMode,
} from "@/lib/trade/goal"
import { formatWholeUsd } from "@/lib/trade/format"

const SETTLE_MS = 500

/**
 * The Goals tab: one switch, one choice, one number.
 *
 * The card is built the way a Trading rules card is — the switch to the left
 * of the title, and everything there is to set in the strip along the bottom,
 * shown only while the goal is on. Under the strip is what the goal means in
 * dollars today, so nobody has to work a percent of their own wallets out in
 * their head.
 */
export default function GoalSettings() {
  useTradePageTitle("Settings")
  const bootstrap = useTradeSettingsBootstrap()
  const goal = bootstrap?.goal ?? null
  const [walletsWorth, setWalletsWorth] = React.useState<number | null>(null)

  // The saved goal rides the page in. Asking the exchanges what the wallets
  // are worth is the slow half, so it happens after the panel is drawn and
  // fills in the line under the number when it lands. It is asked whether the
  // goal is on or off: somebody switching one on wants to see what a percent
  // of their own wallets comes to, and that answer is held for a minute.
  React.useEffect(() => {
    let stopped = false
    loadGoalWallets()
      .then((read) => {
        if (!stopped) setWalletsWorth(read.walletsWorth)
      })
      .catch((error: unknown) => {
        showErrorToast(getGoalLoadErrorMessage(error))
      })
    return () => {
      stopped = true
    }
  }, [])

  if (goal === null) {
    return (
      <Card>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Your goal could not be loaded.
          </p>
        </CardContent>
      </Card>
    )
  }

  return <GoalCard initial={goal} walletsWorth={walletsWorth} />
}

function GoalCard({
  initial,
  walletsWorth,
}: {
  initial: Goal
  walletsWorth: number | null
}) {
  const { goal, setGoal } = useGoal(initial)
  const target = goalTarget(goal, walletsWorth)

  return (
    <CardGroup>
      <Card>
        <CardContent className="flex items-start gap-4">
          <Switch
            id="goal-on"
            checked={goal.on}
            aria-label="Daily goal"
            className="mt-0.5"
            onCheckedChange={(on) => setGoal({ on })}
          />
          <div className="grid min-w-0 gap-1">
            <label
              htmlFor="goal-on"
              className="font-heading text-base font-medium"
            >
              Daily goal
            </label>
            <p className="max-w-2xl text-sm text-muted-foreground">
              How much you are trying to make in a day. It shows in the top
              right of every page as what you have made today and today&apos;s
              target. It never stops an order.
            </p>
          </div>
        </CardContent>
        {goal.on ? (
          <CardFooter className="grid gap-3">
            {/* Indented by the switch's width and the gap, so the first box
                starts under the first letter of the title. */}
            <div className="flex flex-wrap items-end gap-4 pl-15">
              <div className="grid gap-2">
                <FieldLabel htmlFor="goal-mode">Set the goal as</FieldLabel>
                <Select
                  value={goal.mode}
                  onValueChange={(mode) => setGoal({ mode: mode as GoalMode })}
                >
                  <SelectTrigger id="goal-mode" className="w-fit">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {GOAL_MODES.map((mode) => (
                      <SelectItem key={mode} value={mode}>
                        {GOAL_MODE_LABELS[mode]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {goal.mode === "percent" ? (
                <AmountField
                  id="goal-percent"
                  label="Percent of all wallets, a day"
                  value={goal.percent}
                  min={0.01}
                  max={100}
                  suffix="%"
                  onChange={(percent) => setGoal({ percent })}
                />
              ) : (
                <AmountField
                  id="goal-dollars"
                  label="Money made, a day"
                  value={goal.dollars}
                  min={0.01}
                  max={1_000_000}
                  suffix="$"
                  onChange={(dollars) => setGoal({ dollars })}
                />
              )}
            </div>
            <p className="pl-15 text-sm text-muted-foreground">
              {target === null
                ? goalSource(goal, walletsWorth)
                : `Today that is ${formatWholeUsd(target)}. ${goalSource(goal, walletsWorth)}`}
            </p>
          </CardFooter>
        ) : null}
      </Card>
    </CardGroup>
  )
}

/**
 * A number that may have a decimal in it. The box keeps whatever is typed and
 * only a reading inside the limits is saved, so clearing the field to type a
 * new number never writes a blank or a zero over the goal.
 */
function AmountField({
  id,
  label,
  value,
  min,
  max,
  suffix,
  onChange,
}: {
  id: string
  label: string
  value: number
  min: number
  max: number
  suffix: string
  onChange: (value: number) => void
}) {
  const [text, setText] = React.useState(() => String(value))
  const [lastValue, setLastValue] = React.useState(value)
  if (lastValue !== value) {
    setLastValue(value)
    setText(String(value))
  }

  const parsed = Number(text.trim())
  const valid =
    text.trim() !== "" &&
    Number.isFinite(parsed) &&
    parsed >= min &&
    parsed <= max

  return (
    <div className="grid gap-2">
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <div className="flex items-center gap-2">
        <Input
          id={id}
          inputMode="decimal"
          className="w-40"
          value={text}
          aria-invalid={!valid || undefined}
          aria-describedby={valid ? undefined : `${id}-problem`}
          onChange={(event) => {
            setText(event.target.value)
            const next = Number(event.target.value.trim())
            if (
              event.target.value.trim() !== "" &&
              Number.isFinite(next) &&
              next >= min &&
              next <= max
            ) {
              onChange(next)
            }
          }}
        />
        <span className="shrink-0 text-sm text-muted-foreground">{suffix}</span>
      </div>
      {valid ? null : (
        <p id={`${id}-problem`} className="text-xs text-destructive">
          {`Enter a number from ${min.toLocaleString()} to ${max.toLocaleString()}. Your last one is still in use.`}
        </p>
      )}
    </div>
  )
}

/**
 * The goal, changed at once on screen and written once the typing settles, so
 * a number typed digit by digit is one save rather than four. The same shape
 * as `useTradingRules`.
 */
function useGoal(initial: Goal) {
  const [goal, setGoalState] = React.useState(initial)
  const goalRef = React.useRef(initial)
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  const write = React.useCallback((next: Goal) => {
    saveGoalSetting(next).catch((error: unknown) => {
      showErrorToast(getGoalSaveErrorMessage(error))
    })
  }, [])

  React.useEffect(() => {
    return () => {
      if (!timerRef.current) return
      clearTimeout(timerRef.current)
      timerRef.current = null
      write(goalRef.current)
    }
  }, [write])

  const setGoal = React.useCallback(
    (patch: Partial<Goal>) => {
      const next = { ...goalRef.current, ...patch }
      goalRef.current = next
      setGoalState(next)
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => {
        timerRef.current = null
        write(next)
      }, SETTLE_MS)
    },
    [write]
  )

  return { goal, setGoal }
}
