import * as React from "react"
import type { ReactNode } from "react"
import { MinusIcon, SlashIcon, Trash2Icon } from "lucide-react"

import type { PaintTool } from "@/components/trade/paint/use-drawings"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { DisabledReason } from "@/components/ui/disabled-reason"

/**
 * The tools, as a small rail down the chart's left edge.
 *
 * On the chart rather than in the panel header because these belong to the
 * drawing surface, not to the market: the header says which market this is
 * and at what timeframe, and this says what the pointer is holding.
 *
 * The bin clears the whole chart, so it is asked about first. One line at a
 * time is thrown away from the line itself — its own × while it is picked
 * out, or Delete on the keyboard.
 */
const TOOLS: Array<{
  kind: PaintTool
  label: string
  icon: ReactNode
}> = [
  {
    kind: "level",
    label: "Draw a level",
    icon: <MinusIcon />,
  },
  {
    kind: "trendline",
    label: "Draw a trendline",
    icon: <SlashIcon />,
  },
]

export function PaintToolbar({
  tool,
  onPickTool,
  drawingCount,
  drawingsVisible,
  onClearAll,
}: {
  tool: PaintTool | null
  onPickTool: (next: PaintTool | null) => void
  /** How many lines are on this chart; the bin appears once there is one. */
  drawingCount: number
  /** Hidden drawings stay saved, but no paint tool can be picked. */
  drawingsVisible: boolean
  onClearAll: () => void
}) {
  const [confirming, setConfirming] = React.useState(false)

  return (
    // Above both the chart's own canvases and the layer the lines are drawn
    // on, so the buttons stay clickable wherever a line happens to run. The
    // paint marker keeps a press in here from letting the picked line go.
    <div
      data-chart-paint
      className="absolute top-2 left-2 z-20 flex flex-col gap-0.5 rounded-lg border bg-card/85 p-0.5 shadow-sm backdrop-blur-sm"
    >
      {TOOLS.map((entry) => (
        <DisabledReason
          key={entry.kind}
          disabled={!drawingsVisible}
          reason="Show your drawings in View options to use the paint tools."
        >
          <Button
            type="button"
            size="icon-xs"
            variant={tool === entry.kind ? "secondary" : "ghost"}
            aria-pressed={tool === entry.kind}
            aria-label={entry.label}
            disabled={!drawingsVisible}
            // Pressing the tool that is already in hand puts it down, so
            // there is always a way back to plain panning.
            onClick={() => onPickTool(tool === entry.kind ? null : entry.kind)}
          >
            {entry.icon}
          </Button>
        </DisabledReason>
      ))}
      {drawingCount > 0 ? (
        <Button
          type="button"
          size="icon-xs"
          variant="ghost"
          aria-label="Clear every drawing on this chart"
          onClick={() => setConfirming(true)}
        >
          <Trash2Icon />
        </Button>
      ) : null}

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Clear every drawing on this chart?"
        description={
          drawingCount === 1
            ? "The one drawing on this market goes. Other markets keep theirs, and this cannot be undone."
            : `All ${drawingCount} drawings on this market go. Other markets keep theirs, and this cannot be undone.`
        }
        confirmLabel={
          drawingCount === 1
            ? "Delete 1 drawing"
            : `Delete ${drawingCount} drawings`
        }
        onConfirm={() => {
          setConfirming(false)
          onClearAll()
        }}
      />
    </div>
  )
}
