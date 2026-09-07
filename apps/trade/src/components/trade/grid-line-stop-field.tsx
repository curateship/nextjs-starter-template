import * as React from "react"

import { Checkbox } from "@/components/ui/checkbox"
import { FieldLabel } from "@/components/ui/field-label"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { loadDrawings } from "@/lib/api/trade/drawings"
import type { Drawing } from "@/lib/trade/drawings"
import {
  eligibleGridStopLines,
  GRID_LINE_STOP_MISSING,
  matchesGridStopLine,
  type GridLineStop,
} from "@/lib/trade/grid-line-stop"
import { showErrorToast } from "@/lib/toast/error-toast"

export type GridLineStopChoice = { enabled: boolean; stop: GridLineStop | null }

export function GridLineStopField({
  marketKey,
  drawings,
  paused = false,
  busy = false,
  paired = false,
  linkedStop = null,
  value,
  onChange,
}: {
  marketKey: string
  drawings: readonly Drawing[]
  paused?: boolean
  busy?: boolean
  paired?: boolean
  linkedStop?: GridLineStop | null
  value: GridLineStopChoice
  onChange: (value: GridLineStopChoice) => void
}) {
  const id = React.useId()
  const [answer, setAnswer] = React.useState<{
    marketKey: string
    source: readonly Drawing[]
    drawings: Drawing[]
  } | null>(null)
  const [error, setError] = React.useState(false)
  const [attempt, retry] = React.useReducer((count: number) => count + 1, 0)
  React.useEffect(() => {
    let cancelled = false
    loadDrawings(marketKey)
      .then((result) => {
        if (cancelled) return
        setAnswer({ marketKey, source: drawings, drawings: result.drawings })
        setError(false)
      })
      .catch(() => {
        if (!cancelled) setError(true)
      })
    return () => {
      cancelled = true
    }
  }, [marketKey, drawings, attempt])
  const available =
    answer?.marketKey === marketKey && answer.source === drawings
      ? answer.drawings
      : drawings
  const lines = eligibleGridStopLines(available, paused)
  const selected = value.stop
    ? lines.find((drawing) => matchesGridStopLine(drawing, value.stop!))
    : undefined
  const fired = value.stop
    ? available.find(
        (drawing) =>
          matchesGridStopLine(drawing, value.stop!) &&
          drawing.alert?.firedAt != null
      )
    : undefined
  const closing =
    !!fired && !!linkedStop && matchesGridStopLine(fired, linkedStop)
  return (
    <div className="grid min-w-0 gap-2">
      <div className="flex items-center gap-2">
        <Checkbox
          id={id}
          checked={value.enabled}
          disabled={busy}
          onCheckedChange={(checked) => {
            if (!checked) {
              onChange({ enabled: false, stop: null })
              return
            }
            if (paired) {
              showErrorToast(
                "A grid sharing its position with a DCA ladder needs its normal stop."
              )
              return
            }
            if (error) {
              showErrorToast("Could not load drawing alerts. Try again.")
              return
            }
            if (!lines.length) {
              showErrorToast(GRID_LINE_STOP_MISSING)
              return
            }
            onChange({
              enabled: true,
              stop:
                lines.length === 1
                  ? { drawingId: lines[0].id, armedAt: lines[0].alert!.armedAt }
                  : null,
            })
          }}
        />
        <FieldLabel
          htmlFor={id}
          hint="The trading engine closes this grid when the selected drawing alert fires. Replaces the normal price and base stops. Requires the engine and its price feed to stay running."
        >
          Use line alert as stop loss
        </FieldLabel>
      </div>
      {error ? (
        <div role="alert" className="flex items-center gap-2 text-sm">
          Could not load drawing alerts.
          <Button variant="outline" size="sm" onClick={() => retry()}>
            Try again
          </Button>
        </div>
      ) : null}
      {value.enabled ? (
        <>
          <FieldLabel htmlFor={`${id}-line`}>Stop line</FieldLabel>
          <Select
            value={selected?.id ?? ""}
            disabled={busy}
            onValueChange={(drawingId) => {
              const line = lines.find((drawing) => drawing.id === drawingId)
              if (line?.alert)
                onChange({
                  enabled: true,
                  stop: { drawingId, armedAt: line.alert.armedAt },
                })
            }}
          >
            <SelectTrigger
              id={`${id}-line`}
              aria-invalid={!selected}
              className="w-full min-w-0 [&_[data-slot=select-value]]:min-w-0 [&_[data-slot=select-value]]:truncate"
            >
              <SelectValue
                placeholder={
                  fired
                    ? `${fired.shape.name ?? "Selected line"} · alert fired`
                    : "Choose a drawing alert"
                }
              />
            </SelectTrigger>
            <SelectContent
              position="popper"
              className="w-(--radix-select-trigger-width) max-w-[calc(100vw-2rem)]"
            >
              {lines.map((line) => (
                <SelectItem
                  key={line.id}
                  value={line.id}
                  className="[overflow-wrap:anywhere] whitespace-normal"
                >
                  {line.shape.name ??
                    (line.shape.kind === "level"
                      ? "Horizontal line"
                      : "Trendline")}
                  {` · ${line.alert?.buffer ?? 0}% ${line.alert?.direction === "above" ? "above" : "below"} the line`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {value.stop && !selected ? (
            <p
              role={closing ? "status" : "alert"}
              className={
                closing
                  ? "text-sm text-muted-foreground"
                  : "text-sm text-destructive"
              }
            >
              {closing
                ? "The alert fired. The grid is closing."
                : "The selected alert is unavailable. Choose an active alert or restore the normal stop."}
            </p>
          ) : null}
        </>
      ) : null}
    </div>
  )
}
