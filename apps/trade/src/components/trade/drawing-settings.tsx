import * as React from "react"
import { Trash2Icon } from "lucide-react"
import { toast } from "sonner"

import { useTradePageTitle } from "@/app/page-title"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardGroup,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Label } from "@/components/ui/label"
import { LoadingRow } from "@/components/ui/loading-row"
import {
  clearChosenDrawings,
  getClearDrawingsErrorMessage,
  getClearableDrawingsLoadErrorMessage,
  loadClearableDrawings,
} from "@/lib/api/trade/drawings"
import { showErrorToast } from "@/lib/toast/error-toast"
import type { ClearableCounts, ClearableKind } from "@/lib/trade/drawings"

const KINDS: ClearableKind[] = ["trendlines", "fibs", "alerts"]

const LABELS: Record<ClearableKind, string> = {
  trendlines: "Trendlines",
  fibs: "Fibs",
  alerts: "Price alerts",
}

const NOUNS: Record<ClearableKind, [string, string]> = {
  trendlines: ["trendline", "trendlines"],
  fibs: ["fib", "fibs"],
  alerts: ["price alert", "price alerts"],
}

function amount(kind: ClearableKind, count: number) {
  return `${count} ${NOUNS[kind][count === 1 ? 0 : 1]}`
}

function markets(count: number) {
  return count === 1 ? "1 market" : `${count} markets`
}

// "a", "a and b", "a, b and c".
function joined(parts: string[]) {
  return parts.length < 2
    ? parts.join("")
    : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`
}

/** How many of one kind the clear would actually delete. */
function clearable(counts: ClearableCounts, kind: ClearableKind) {
  return kind === "trendlines"
    ? counts.trendlines.total - counts.held
    : counts[kind].total
}

/**
 * The Drawings tab: tick trendlines, fibs and price alerts, and clear the
 * ticked ones from every market at once. The chart's own bin clears one
 * market; this is for starting the whole account over. Levels always stay,
 * and so does any trendline a running grid uses as its stop.
 */
export default function DrawingSettings() {
  useTradePageTitle("Settings")
  return (
    <CardGroup>
      <ClearDrawingsCard />
    </CardGroup>
  )
}

function ClearDrawingsCard() {
  const mounted = React.useRef(false)
  const [counts, setCounts] = React.useState<ClearableCounts | null>(null)
  const [loadFailed, setLoadFailed] = React.useState(false)
  // Nothing starts ticked: a delete across every market is chosen, never
  // assumed.
  const [ticked, setTicked] = React.useState<Record<ClearableKind, boolean>>({
    trendlines: false,
    fibs: false,
    alerts: false,
  })
  const [confirming, setConfirming] = React.useState(false)
  const [busy, setBusy] = React.useState(false)

  const load = React.useCallback(() => {
    loadClearableDrawings()
      .then((answer) => {
        if (!mounted.current) return
        setCounts(answer)
        setLoadFailed(false)
      })
      .catch((error: unknown) => {
        if (!mounted.current) return
        setLoadFailed(true)
        showErrorToast(getClearableDrawingsLoadErrorMessage(error))
      })
  }, [])

  React.useEffect(() => {
    mounted.current = true
    load()
    return () => {
      mounted.current = false
    }
  }, [load])

  const chosen = KINDS.filter((kind) => ticked[kind])

  const ask = () => {
    if (!counts) return
    if (chosen.length === 0) {
      showErrorToast("Tick at least one thing to clear.")
      return
    }
    if (chosen.every((kind) => clearable(counts, kind) === 0)) {
      showErrorToast(
        chosen.includes("trendlines") && counts.held > 0
          ? "There is nothing to clear. The trendlines left are running grids' stops."
          : "There is nothing to clear in what you ticked."
      )
      return
    }
    setConfirming(true)
  }

  const clear = async () => {
    setBusy(true)
    try {
      const answer = await clearChosenDrawings(ticked)
      const gone = chosen
        .filter((kind) => answer[kind] > 0)
        .map((kind) => amount(kind, answer[kind]))
      toast.success(
        [
          gone.length ? `Deleted ${joined(gone)}.` : "Nothing needed clearing.",
          answer.kept > 0
            ? `Kept ${amount("trendlines", answer.kept)} that running grids use as their stop.`
            : "",
        ]
          .filter(Boolean)
          .join(" ")
      )
      if (mounted.current) setConfirming(false)
      load()
    } catch (error) {
      showErrorToast(getClearDrawingsErrorMessage(error))
    } finally {
      if (mounted.current) setBusy(false)
    }
  }

  const goes = counts
    ? chosen
        .filter((kind) => clearable(counts, kind) > 0)
        .map((kind) => amount(kind, clearable(counts, kind)))
    : []

  return (
    <Card>
      <CardHeader>
        <CardTitle>Clear drawings</CardTitle>
        <CardDescription>
          Tick what to delete from every market at once. Levels always stay,
          and so does any trendline a running grid uses as its stop.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {counts === null ? (
          <div className="flex items-center justify-between gap-3">
            {loadFailed ? (
              <p className="text-sm text-muted-foreground">
                Your drawings could not be counted.
              </p>
            ) : (
              <LoadingRow label="Counting your drawings" />
            )}
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
          </div>
        ) : (
          <div className="grid gap-4">
            {KINDS.map((kind) => {
              const id = `clear-${kind}`
              const { total, markets: on } = counts[kind]
              return (
                <div key={kind} className="flex items-start gap-2">
                  <Checkbox
                    id={id}
                    checked={ticked[kind]}
                    disabled={busy}
                    className="mt-0.5"
                    onCheckedChange={(checked) =>
                      setTicked((now) => ({ ...now, [kind]: checked === true }))
                    }
                  />
                  <div className="grid min-w-0 gap-1">
                    <Label htmlFor={id}>{LABELS[kind]}</Label>
                    <span className="text-sm text-muted-foreground">
                      {total === 0
                        ? "None on any market."
                        : `${total} on ${markets(on)}.`}
                      {kind === "trendlines" && counts.held > 0
                        ? ` ${counts.held} of them ${counts.held === 1 ? "is a grid's stop and stays" : "are grids' stops and stay"}.`
                        : ""}
                      {kind === "trendlines"
                        ? " Their line alerts go with them."
                        : kind === "alerts"
                          ? " Only alerts still waiting go. Fired history stays."
                          : ""}
                    </span>
                  </div>
                </div>
              )
            })}
            <div>
              <Button type="button" variant="destructive" onClick={ask}>
                <Trash2Icon aria-hidden="true" />
                Clear selected
              </Button>
            </div>
          </div>
        )}
      </CardContent>

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        loading={busy}
        title="Clear these from every market?"
        description={[
          `${joined(goes)} go from every market.`,
          ticked.trendlines && counts && counts.held > 0
            ? `${amount("trendlines", counts.held)} stay because running grids use them as their stop.`
            : "",
          "Levels stay. This cannot be undone.",
        ]
          .filter(Boolean)
          .join(" ")}
        confirmLabel="Delete them"
        onConfirm={() => void clear()}
      />
    </Card>
  )
}
