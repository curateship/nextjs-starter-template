import * as React from "react"
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts"
import { Loader2Icon } from "lucide-react"

import { Hint } from "@/components/social/hint"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { Label } from "@/components/ui/label"
import { NumberField } from "@/components/ui/number-field"
import { Switch } from "@/components/ui/switch"
import type { RedditAccountRow } from "@/lib/api/social/reddit-accounts"
import { getXErrorMessage, loadXReadings, setXAccount, type XReadingView } from "@/lib/api/social/x"
import { X_PAID_POST_CHARS, X_POST_CHARS } from "@/lib/social/x/options"
import { postedDateText } from "@/lib/social/wording"
import { showErrorToast } from "@/lib/toast/error-toast"

import { X_REACH_HINT, xReachWords } from "../x/x-words"

const SAVE_DELAY_MS = 700

const chartConfig: ChartConfig = {
  followers: { label: "Followers", color: "var(--foreground)" },
  views: { label: "Views", color: "var(--chart-3)" },
}

const dayFormat = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short" })

/**
 * An X account's own settings, in its settings window on the Accounts
 * dashboard: Paid (part 27), Follow the people it replies to (part 44),
 * every how-many-th reply starts as Help only (part 24), the daily look's guess whether X hides it
 * (part 42), and its followers and views over time (part 43). Each saves the
 * moment it changes, apart from the window's Save changes.
 */
export function XAccountCard({ account, onChanged }: { account: RedditAccountRow; onChanged: () => Promise<void> }) {
  const [paid, setPaid] = React.useState(account.x.paid)
  const [followBack, setFollowBack] = React.useState(account.x.followBack)
  const [helpEvery, setHelpEvery] = React.useState(account.x.helpEvery)
  const [readings, setReadings] = React.useState<XReadingView[] | null>(null)
  const [readingsError, setReadingsError] = React.useState<string | null>(null)
  const timer = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  // The number as typed, and as the server last took it. A refused save goes
  // back to the saved one; closing the window saves the typed one.
  const helpLatest = React.useRef(account.x.helpEvery)
  const helpSaved = React.useRef(account.x.helpEvery)

  React.useEffect(() => {
    let live = true
    loadXReadings(account.id).then(
      (rows) => {
        if (live) setReadings(rows)
      },
      (failure: unknown) => {
        if (live) setReadingsError(getXErrorMessage(failure))
      }
    )
    return () => {
      live = false
    }
  }, [account.id])

  /** Saves one switch; a refused save puts the switch back and says why. */
  async function save(patch: { paid?: boolean; followBack?: boolean }, undo: () => void) {
    try {
      await setXAccount({ accountId: account.id, ...patch })
      await onChanged()
    } catch (failure) {
      undo()
      showErrorToast(getXErrorMessage(failure))
    }
  }

  /**
   * Saves the Help only number now, if it differs from what the server holds:
   * 700ms after the last change, on Enter, on leaving the field, and when the
   * window closes. A refused save puts back the last saved number and says why.
   */
  const saveHelpEvery = React.useCallback(async () => {
    clearTimeout(timer.current)
    timer.current = undefined
    const value = helpLatest.current
    if (value === helpSaved.current) return
    try {
      await setXAccount({ accountId: account.id, helpEvery: value })
      helpSaved.current = value
    } catch (failure) {
      if (helpLatest.current === value) {
        helpLatest.current = helpSaved.current
        setHelpEvery(helpSaved.current)
      }
      showErrorToast(getXErrorMessage(failure))
      return
    }
    try {
      await onChanged()
    } catch (failure) {
      showErrorToast(getXErrorMessage(failure))
    }
  }, [account.id, onChanged])

  // Closing the window inside the 700ms still saves the number typed last.
  const saveOnClose = React.useRef(saveHelpEvery)
  React.useEffect(() => {
    saveOnClose.current = saveHelpEvery
  }, [saveHelpEvery])
  React.useEffect(() => () => void saveOnClose.current(), [])

  const data = (readings ?? []).map((reading) => ({
    at: new Date(`${reading.readOn}T12:00:00Z`).getTime(),
    followers: reading.followers,
    views: reading.views,
  }))

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>On X</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="flex items-center justify-between gap-3">
          <Label htmlFor={`x-paid-${account.id}`} className="grid gap-0.5 font-normal">
            <span className="text-sm">Paid</span>
            <span className="text-xs text-muted-foreground">
              Writes up to {X_PAID_POST_CHARS.toLocaleString("en-US")} characters instead of {X_POST_CHARS}, and may edit a reply in the hour after it went out.
            </span>
          </Label>
          <Switch
            id={`x-paid-${account.id}`}
            checked={paid}
            onCheckedChange={(checked) => {
              setPaid(checked)
              void save({ paid: checked }, () => setPaid(!checked))
            }}
          />
        </div>
        <div className="flex items-center justify-between gap-3">
          <Label htmlFor={`x-follow-${account.id}`} className="grid gap-0.5 font-normal">
            <span className="text-sm">Follow the people it replies to</span>
            <span className="text-xs text-muted-foreground">In waking hours, up to the follows a day in Settings → Behaviour.</span>
          </Label>
          <Switch
            id={`x-follow-${account.id}`}
            checked={followBack}
            onCheckedChange={(checked) => {
              setFollowBack(checked)
              void save({ followBack: checked }, () => setFollowBack(!checked))
            }}
          />
        </div>
        <div onBlur={() => void saveHelpEvery()}>
          <NumberField
            id={`x-help-every-${account.id}`}
            label="Every Nth reply starts as Help only"
            hint="With 3, every third reply opens with Help only switched on, so it never names the product. You can still switch it off. 0 means never."
            value={helpEvery}
            min={0}
            max={20}
            inputClassName="w-full sm:w-32"
            onChange={(value) => {
              helpLatest.current = value
              setHelpEvery(value)
              clearTimeout(timer.current)
              timer.current = setTimeout(() => void saveHelpEvery(), SAVE_DELAY_MS)
            }}
            onCommit={() => void saveHelpEvery()}
          />
        </div>

        <p className="text-sm">
          <Hint label={X_REACH_HINT}>
            <span className={account.x.reach === "hidden" || account.x.reach === "folded" ? "text-amber-700 dark:text-amber-400" : undefined}>
              {xReachWords(account.x.reach)}
            </span>
          </Hint>
          {account.x.reachAt ? <span className="text-muted-foreground">, looked {postedDateText(new Date(account.x.reachAt)).toLowerCase()}</span> : null}
          <span className="text-muted-foreground">. Check now on its row looks again.</span>
        </p>

        <div className="grid gap-2">
          <p className="text-xs font-medium text-muted-foreground">Followers and views, day by day</p>
          {readingsError ? (
            <p className="text-sm text-muted-foreground">The readings could not be read. {readingsError}</p>
          ) : readings === null ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2Icon className="size-4 animate-spin" aria-hidden="true" />
              Reading its numbers
            </p>
          ) : data.length > 1 ? (
            <div className="h-[180px] w-full min-w-0">
              <ChartContainer config={chartConfig} className="h-full w-full">
                <LineChart data={data} margin={{ top: 8, right: 0, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="0" vertical={false} />
                  <XAxis
                    dataKey="at"
                    type="number"
                    scale="time"
                    domain={["dataMin", "dataMax"]}
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 10 }}
                    dy={6}
                    tickFormatter={(value: number) => dayFormat.format(new Date(value))}
                  />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, dx: -5 }} width={40} />
                  <ChartTooltip
                    content={
                      <ChartTooltipContent
                        labelFormatter={(_, payload) => {
                          const at = payload?.[0]?.payload?.at
                          return typeof at === "number" ? dayFormat.format(new Date(at)) : ""
                        }}
                      />
                    }
                  />
                  {(["followers", "views"] as const).map((key) => (
                    <Line key={key} dataKey={key} type="monotone" isAnimationActive={false} stroke={`var(--color-${key})`} strokeWidth={2} dot={false} connectNulls />
                  ))}
                </LineChart>
              </ChartContainer>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">The chart draws once the account has been read on two different days.</p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
