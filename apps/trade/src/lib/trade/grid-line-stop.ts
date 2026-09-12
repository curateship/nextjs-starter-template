import { z } from "zod"

import { drawingAlertArmed, priceAtTime, type Drawing } from "./drawings"

/** An enabled alert is a different instruction from a later re-enable. */
export const gridLineStopSchema = z
  .object({
    drawingId: z.string().min(1).max(36),
    armedAt: z.number().int().nonnegative(),
  })
  .strict()

export type GridLineStop = z.infer<typeof gridLineStopSchema>

export const GRID_LINE_STOP_MISSING = "Draw a line with an alert first."

export const GRID_LINE_STOP_ERRORS = {
  SMART_GRID_LINE_STOP_UNAVAILABLE:
    "The selected drawing alert is unavailable. Choose an active alert or restore the normal stop.",
  SMART_GRID_LINE_STOP_PENDING:
    "The drawing alert has fired and this grid is closing. Its stop cannot be changed now.",
  SMART_GRID_LINE_STOP_LINKED:
    "A running grid still needs this alert. Replace its stop or close the grid before removing or pausing the alert.",
  SMART_GRID_LINE_STOP_PAIRED:
    "A grid sharing its position with a DCA ladder needs its normal stop.",
  SMART_GRID_LINE_STOP_PAUSED:
    "Line alerts are paused in Settings. Switch them on before using a line as the grid stop.",
  SMART_GRID_LINE_STOP_ENGINE:
    "The trading engine and database need the line-stop update before this option can be used.",
  SMART_GRID_LINE_STOP_MANUAL:
    "Drawing stops are available for manually placed grids only.",
  SMART_GRID_LINE_STOP_CLOSE_UNCONFIRMED:
    "The grid is waiting for confirmed closure. New grid entries remain stopped.",
} as const

/** Add the affected market and wallet to the shared API refusal sentences. */
export function withLinkedGridStopMessage(
  describe: (error: unknown) => string
) {
  return (error: unknown): string => {
    const message =
      error instanceof Error
        ? error.message
        : typeof error === "string"
          ? error
          : ""
    const linked = message.match(/SMART_GRID_LINE_STOP_LINKED:([^\n]+)/)
    return linked
      ? `The ${linked[1]} grid still needs this alert. Replace its stop or close the grid first.`
      : describe(error)
  }
}

/** Callers supply drawings from the current account and exact market key. */
export function eligibleGridStopLines(
  drawings: readonly Drawing[],
  paused: boolean,
  now = Date.now()
): Drawing[] {
  if (paused) return []
  return drawings.filter(
    (drawing) =>
      drawing.shape.kind !== "fib" &&
      drawingAlertArmed(drawing.alert) &&
      drawing.alert?.expiresAt === undefined &&
      priceAtTime(drawing.shape, now) !== null
  )
}

export function matchesGridStopLine(
  drawing: Drawing,
  stop: GridLineStop
): boolean {
  return (
    drawing.id === stop.drawingId && drawing.alert?.armedAt === stop.armedAt
  )
}
