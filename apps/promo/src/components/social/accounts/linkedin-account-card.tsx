import * as React from "react"
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts"
import { Loader2Icon, RefreshCwIcon } from "lucide-react"
import { toast } from "sonner"

import { Hint } from "@/components/social/hint"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { actOnLinkedinAccount, getLinkedinErrorMessage, loadLinkedinReadings, setLinkedinAccount, type LinkedinReadingView } from "@/lib/api/social/linkedin"
import type { RedditAccountRow } from "@/lib/api/social/reddit-accounts"
import { LINKEDIN_SEEN_WORDS } from "@/lib/social/linkedin/options"
import { postedDateText } from "@/lib/social/wording"
import { showErrorToast } from "@/lib/toast/error-toast"

const chartConfig: ChartConfig = {
  followers: { label: "Followers", color: "var(--foreground)" },
  connections: { label: "Connections", color: "var(--chart-2)" },
  profileViews: { label: "Profile views", color: "var(--chart-3)" },
  impressions: { label: "Impressions", color: "var(--chart-4)" },
}

const LINES = ["followers", "connections", "profileViews", "impressions"] as const

const dayFormat = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short" })

/** What the weekly look at its comments is: a guess, because LinkedIn never says. */
const SEEN_HINT = "Promo's best guess from its weekly look for the account's latest comments under their posts, as a stranger sees them. LinkedIn never says."

/**
 * A LinkedIn account's own settings, in its settings window on the Accounts
 * dashboard: Premium (part 8), the box for the code LinkedIn emailed when it
 * asks for one (part 4), the weekly look at whether its comments still show
 * (part 46) and its numbers week by week (part 47). Each saves or goes the
 * moment it is pressed, apart from the window's Save changes.
 */
export function LinkedinAccountCard({ account, onChanged }: { account: RedditAccountRow; onChanged: () => Promise<void> }) {
  const [premium, setPremium] = React.useState(account.linkedin.premium)
  const [code, setCode] = React.useState("")
  const [busy, setBusy] = React.useState<null | "code" | "look">(null)
  const [readings, setReadings] = React.useState<LinkedinReadingView[] | null>(null)
  const [readingsError, setReadingsError] = React.useState<string | null>(null)

  React.useEffect(() => {
    let live = true
    loadLinkedinReadings(account.id).then(
      (rows) => {
        if (live) setReadings(rows)
      },
      (failure: unknown) => {
        if (live) setReadingsError(getLinkedinErrorMessage(failure))
      }
    )
    return () => {
      live = false
    }
  }, [account.id])

  async function act(which: "code" | "look", done: string, input: Parameters<typeof actOnLinkedinAccount>[0]) {
    setBusy(which)
    try {
      await actOnLinkedinAccount(input)
      toast.success(done)
      if (which === "code") setCode("")
      await onChanged()
    } catch (failure) {
      showErrorToast(getLinkedinErrorMessage(failure))
    } finally {
      setBusy(null)
    }
  }

  // A number LinkedIn did not show is a gap in its line, never a 0.
  const data = (readings ?? []).map((reading) => ({
    at: new Date(`${reading.readOn}T12:00:00Z`).getTime(),
    followers: reading.followers,
    connections: reading.connections,
    profileViews: reading.profileViews,
    impressions: reading.impressions,
  }))
  const seen = account.linkedin.seen

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>On LinkedIn</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="flex items-center justify-between gap-3">
          <Label htmlFor={`linkedin-premium-${account.id}`} className="grid gap-0.5 font-normal">
            <span className="text-sm">Premium</span>
            <span className="text-xs text-muted-foreground">Shows every profile viewer and every number. Read off the account&apos;s badge too, so a look may change it.</span>
          </Label>
          <Switch
            id={`linkedin-premium-${account.id}`}
            checked={premium}
            onCheckedChange={async (checked) => {
              setPremium(checked)
              try {
                await setLinkedinAccount({ accountId: account.id, premium: checked })
                await onChanged()
              } catch (failure) {
                setPremium(!checked)
                showErrorToast(getLinkedinErrorMessage(failure))
              }
            }}
          />
        </div>

        {account.linkedin.codeAsked && !account.profile ? (
          <p className="rounded-lg border p-3 text-sm">
            LinkedIn emailed this account a code. It runs on a phone, so type the code into the LinkedIn app through the phone&apos;s screen window on the Phones dashboard.
          </p>
        ) : null}
        {account.linkedin.codeAsked && account.profile ? (
          <form
            className="grid gap-2 rounded-lg border p-3"
            onSubmit={(event) => {
              event.preventDefault()
              if (!code.trim()) {
                showErrorToast("Paste the code from LinkedIn's email first.")
                return
              }
              void act("code", "Typing the code in the account's browser.", { accountId: account.id, action: "code", code: code.trim() })
            }}
          >
            <Label htmlFor={`linkedin-code-${account.id}`}>The code LinkedIn emailed</Label>
            <p className="text-xs text-muted-foreground">
              LinkedIn is asking this account for the code it sent to the account&apos;s email. Paste it within 15 minutes. It is typed into the account&apos;s
              browser and never kept.
            </p>
            <div className="flex items-center gap-2">
              <Input
                id={`linkedin-code-${account.id}`}
                inputMode="numeric"
                autoComplete="one-time-code"
                className="w-full sm:w-40"
                value={code}
                onChange={(event) => setCode(event.target.value)}
              />
              <Button type="submit" disabled={busy !== null}>
                {busy === "code" ? <Loader2Icon className="animate-spin" /> : null}
                Send code
              </Button>
            </div>
          </form>
        ) : null}

        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Hint label={SEEN_HINT}>
            <span className={seen === "hidden" ? "text-amber-700 dark:text-amber-400" : undefined}>{seen ? LINKEDIN_SEEN_WORDS[seen] : "Comments not looked at yet"}</span>
          </Hint>
          {account.linkedin.seenAt ? <span className="text-muted-foreground">looked {postedDateText(new Date(account.linkedin.seenAt)).toLowerCase()}</span> : null}
          <span className="flex-1" />
          <Hint label="Look now whether a stranger sees its latest comments under their posts">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy !== null}
              onClick={() => void act("look", "Looking for its latest comments now.", { accountId: account.id, action: "look" })}
            >
              {busy === "look" ? <Loader2Icon className="animate-spin" /> : <RefreshCwIcon />}
              Check now
            </Button>
          </Hint>
        </div>

        <div className="grid gap-2">
          <p className="text-xs font-medium text-muted-foreground">Followers, connections, profile views and impressions, week by week</p>
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
                  {LINES.map((key) => (
                    <Line key={key} dataKey={key} type="monotone" isAnimationActive={false} stroke={`var(--color-${key})`} strokeWidth={2} dot={false} />
                  ))}
                </LineChart>
              </ChartContainer>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              The chart draws once the account has been read in two different weeks. Its numbers are read once a week in its own browser; on a phone they
              are not read.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
