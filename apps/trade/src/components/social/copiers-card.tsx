import * as React from "react"
import { Loader2Icon, RotateCcwIcon } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { FieldLabel } from "@/components/ui/field-label"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import {
  getCopyErrorMessage,
  readMyCopiers,
  saveCopySettings,
} from "@/lib/api/trade/copy-trading"
import {
  LEADERBOARD_MIN_DAYS,
  LEADERBOARD_MIN_TRADES,
} from "@/lib/trade/public-profile/profile"
import type { MyCopiers } from "@/lib/trade/copy/copy-rules"
import { formatUsd, formatWholeUsd } from "@/lib/trade/format"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"

/**
 * The trader's own side of copying, inside the Public profile window: the
 * "Allow copying" switch, where their share of the fee is paid, and how many
 * follow and copy them. Never who: the copiers stay anonymous.
 *
 * It saves on its own, apart from the profile form around it, because
 * switching copying off must take effect the moment it is pressed.
 */
export function CopiersCard() {
  const [data, setData] = React.useState<MyCopiers | null>(null)
  const [failed, setFailed] = React.useState(false)
  const [attempt, setAttempt] = React.useState(0)
  const [payout, setPayout] = React.useState("")
  const [busy, setBusy] = React.useState<"switch" | "payout" | null>(null)
  const [invalid, setInvalid] = React.useState(false)

  React.useEffect(() => {
    let live = true
    readMyCopiers()
      .then((next) => {
        if (!live) return
        setData(next)
        setPayout(next?.payoutAddress ?? "")
      })
      .catch(() => {
        if (live) setFailed(true)
      })
    return () => {
      live = false
    }
  }, [attempt])

  async function save(patch: { allowCopying?: boolean; payoutAddress?: string }) {
    if (!data) return
    const next = {
      allowCopying: patch.allowCopying ?? data.allowCopying,
      payoutAddress: (patch.payoutAddress ?? payout).trim() || null,
    }
    setBusy(patch.allowCopying === undefined ? "payout" : "switch")
    try {
      await saveCopySettings(next)
      setData({ ...data, ...next })
      setInvalid(false)
      dismissErrorToast()
      toast.success(
        patch.allowCopying === undefined
          ? "Payout address saved."
          : next.allowCopying
            ? "Copying is on. People can copy your trades."
            : "Copying is off. Every running copy paused, and nothing was closed."
      )
    } catch (error) {
      if (patch.allowCopying === undefined) setInvalid(true)
      showErrorToast(getCopyErrorMessage(error))
    } finally {
      setBusy(null)
    }
  }

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle as="h3">Copiers</CardTitle>
        <CardDescription>
          People can copy your trades once your page is public, {LEADERBOARD_MIN_DAYS}{" "}
          days long and has {LEADERBOARD_MIN_TRADES} closed trades. You earn a
          share of the fee on each copied real-money trade. You never see who
          copies you.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {!data ? (
          <div className="grid justify-items-center gap-3 py-2 text-sm text-muted-foreground">
            {failed ? (
              <>
                <p>Your copier figures could not be read.</p>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setFailed(false)
                    setAttempt((count) => count + 1)
                  }}
                >
                  <RotateCcwIcon className="size-4" />
                  Try again
                </Button>
              </>
            ) : (
              <Loader2Icon
                className="size-4 animate-spin"
                aria-label="Reading your copiers"
              />
            )}
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="copy-allow">Allow copying</Label>
              <Switch
                id="copy-allow"
                checked={data.allowCopying}
                disabled={busy !== null}
                onCheckedChange={(allowCopying) => void save({ allowCopying })}
              />
            </div>
            <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
              <Figure label="Following you" value={String(data.followers)} />
              <Figure label="Copying you" value={String(data.copiers)} />
              <Figure
                label="Money copying you"
                value={`up to ${formatWholeUsd(data.copyingUsd)}`}
              />
              <Figure label="Owed to you" value={formatUsd(data.owedUsd)} />
              <Figure label="Paid to you" value={formatUsd(data.paidUsd)} />
            </dl>
            <div className="grid gap-2">
              <FieldLabel
                htmlFor="copy-payout"
                hint="Your share of the fee is paid in USDC to this address. Payouts are sent by hand for now."
              >
                Payout address
              </FieldLabel>
              <div className="flex gap-2">
                <Input
                  id="copy-payout"
                  value={payout}
                  placeholder="0x…"
                  spellCheck={false}
                  autoCapitalize="none"
                  aria-invalid={invalid || undefined}
                  onChange={(event) => setPayout(event.target.value)}
                  onKeyDown={(event) => {
                    // Enter saves this address, not the profile form around it.
                    if (event.key !== "Enter") return
                    event.preventDefault()
                    void save({ payoutAddress: payout })
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy !== null}
                  onClick={() => void save({ payoutAddress: payout })}
                >
                  {busy === "payout" ? (
                    <Loader2Icon className="size-4 animate-spin" />
                  ) : null}
                  Save
                </Button>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-0.5">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium tabular-nums">{value}</dd>
    </div>
  )
}
