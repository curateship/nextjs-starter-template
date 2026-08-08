import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { parseMarketKey } from "@/lib/protocols/contracts"
import {
  drawingShapeSchema,
  DRAWINGS_FULL,
  MAX_DRAWINGS_PER_MARKET,
  type Drawing,
  type DrawingShape,
} from "@/lib/trade/drawings"
import { userGet, userPost } from "@/server/guards"
import {
  clearChartDrawings,
  deleteChartDrawing,
  loadChartDrawings,
  saveChartDrawing,
} from "@/server/trade/drawings"

import { createErrorMessage } from "./error-message"

/**
 * The lines somebody has drawn on a market's chart.
 *
 * The chart itself never reaches this file — it draws whatever shapes it is
 * handed and knows nothing about where they came from. This is the paint
 * tools' own door.
 */

// Refused, never guessed at: a key that does not parse is an error, not an
// invitation to fall back to a market that does exist.
const marketKeySchema = z
  .string()
  .max(120)
  .refine((key) => parseMarketKey(key) !== null, {
    message: "Not a market key.",
  })

// The browser makes the id, so a drawing is on screen the instant it is drawn
// rather than after a round trip. Bounded to the length of the column it goes
// into; anything longer is a caller writing its own ids, not this app.
const drawingIdSchema = z.string().min(1).max(36)

// Used by both the read and the clear: "which market" is the whole input to
// each of them.
const marketSchema = z.object({ marketKey: marketKeySchema })

const saveDrawingSchema = z.object({
  marketKey: marketKeySchema,
  id: drawingIdSchema,
  shape: drawingShapeSchema,
})

const deleteDrawingSchema = z.object({ id: drawingIdSchema })

const loadChartDrawingsFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(marketSchema)
  .handler(async ({ data, context }): Promise<{ drawings: Drawing[] }> => {
    return {
      drawings: await loadChartDrawings(context.user.id, data.marketKey),
    }
  })

const saveChartDrawingFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(saveDrawingSchema)
  .handler(async ({ data, context }): Promise<{ saved: true }> => {
    await saveChartDrawing(context.user.id, data.marketKey, {
      id: data.id,
      shape: data.shape,
    })
    return { saved: true }
  })

const deleteChartDrawingFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(deleteDrawingSchema)
  .handler(async ({ data, context }): Promise<{ deleted: boolean }> => {
    return { deleted: await deleteChartDrawing(context.user.id, data.id) }
  })

const clearChartDrawingsFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(marketSchema)
  .handler(async ({ data, context }): Promise<{ deleted: number }> => {
    return { deleted: await clearChartDrawings(context.user.id, data.marketKey) }
  })

export function loadDrawings(marketKey: string) {
  return loadChartDrawingsFn({ data: { marketKey } })
}

export function saveDrawing(
  marketKey: string,
  drawing: { id: string; shape: DrawingShape }
) {
  return saveChartDrawingFn({
    data: { marketKey, id: drawing.id, shape: drawing.shape },
  })
}

export function deleteDrawing(id: string) {
  return deleteChartDrawingFn({ data: { id } })
}

export function clearDrawings(marketKey: string) {
  return clearChartDrawingsFn({ data: { marketKey } })
}

export const getDrawingsErrorMessage = createErrorMessage(
  {
    [DRAWINGS_FULL]: `This market already has ${MAX_DRAWINGS_PER_MARKET} drawings. Delete one to make room.`,
  },
  "That drawing did not save. Try it again."
)

export const getDrawingsLoadErrorMessage = createErrorMessage(
  {},
  "Your drawings for this market could not be loaded."
)
