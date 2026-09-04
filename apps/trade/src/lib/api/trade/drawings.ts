import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { parseMarketKey } from "@/lib/protocols/contracts"
import {
  drawingShapeSchema,
  DRAWING_ALERT_NO_PRICE,
  DRAWING_ALERT_NOT_ARMED,
  DRAWINGS_FULL,
  MAX_DRAWING_BUFFER_PCT,
  MAX_DRAWINGS_PER_MARKET,
  type Drawing,
  type DrawingShape,
} from "@/lib/trade/drawings"
import { lineAlertListSchema } from "@/lib/trade/line-alerts"
import { userGet, userPost } from "@/server/guards"
import { loadDrawingAlerts } from "@/server/trade/drawing-alerts"
import {
  clearChartDrawings,
  deleteChartDrawing,
  loadChartDrawings,
  saveChartDrawing,
  setChartDrawingAlert,
  setChartDrawingAlertBuffer,
} from "@/server/trade/drawings"

import { createErrorMessage } from "../error-message"
import { invalidateDashboardBootstrap } from "@/lib/trade/dashboard-bootstrap-cache"

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

// The live price on the screen, when it has one. It only matters to a line
// carrying an alert, which points itself at the price again after a move.
const currentPriceSchema = z.number().positive().finite().nullable()

const saveDrawingSchema = z.object({
  marketKey: marketKeySchema,
  id: drawingIdSchema,
  shape: drawingShapeSchema,
  currentPrice: currentPriceSchema.optional(),
})

const deleteDrawingSchema = z.object({ id: drawingIdSchema })

const setAlertSchema = z.object({
  id: drawingIdSchema,
  on: z.boolean(),
  currentPrice: currentPriceSchema,
})

// A percentage past the line, or null for none. Bounded the same way the
// stored record is, so a hand-made request cannot write a number the reader
// would later refuse.
const setBufferSchema = z.object({
  id: drawingIdSchema,
  buffer: z.number().positive().max(MAX_DRAWING_BUFFER_PCT).nullable(),
})

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
    await saveChartDrawing(
      context.user.id,
      data.marketKey,
      { id: data.id, shape: data.shape },
      data.currentPrice ?? null
    )
    return { saved: true }
  })

const loadLineAlertsFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .handler(async ({ context }) =>
    lineAlertListSchema.parse(await loadDrawingAlerts(context.user.id))
  )

const setChartDrawingAlertFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(setAlertSchema)
  .handler(async ({ data, context }): Promise<{ drawing: Drawing }> => {
    return { drawing: await setChartDrawingAlert(context.user.id, data) }
  })

const setChartDrawingAlertBufferFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(setBufferSchema)
  .handler(async ({ data, context }): Promise<{ drawing: Drawing }> => {
    return {
      drawing: await setChartDrawingAlertBuffer(context.user.id, data),
    }
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
    return {
      deleted: await clearChartDrawings(context.user.id, data.marketKey),
    }
  })

export function loadDrawings(marketKey: string) {
  return loadChartDrawingsFn({ data: { marketKey } })
}

export async function saveDrawing(
  marketKey: string,
  drawing: { id: string; shape: DrawingShape },
  currentPrice: number | null = null
) {
  const answer = await saveChartDrawingFn({
    data: { marketKey, id: drawing.id, shape: drawing.shape, currentPrice },
  })
  invalidateDashboardBootstrap()
  return answer
}

/** Every line alert on the account, armed and fired, for the Alerts panel. */
export function loadLineAlerts() {
  return loadLineAlertsFn()
}

/** Switch one line's alert on or off, and get the line back as saved. */
export async function setDrawingAlert(
  id: string,
  on: boolean,
  currentPrice: number | null
) {
  const answer = await setChartDrawingAlertFn({
    data: { id, on, currentPrice },
  })
  invalidateDashboardBootstrap()
  return answer.drawing
}

/** Set or clear how far past the line one armed alert waits, as a percent. */
export async function setDrawingAlertBuffer(
  id: string,
  buffer: number | null
) {
  const answer = await setChartDrawingAlertBufferFn({ data: { id, buffer } })
  invalidateDashboardBootstrap()
  return answer.drawing
}

export async function deleteDrawing(id: string) {
  const answer = await deleteChartDrawingFn({ data: { id } })
  invalidateDashboardBootstrap()
  return answer
}

export async function clearDrawings(marketKey: string) {
  const answer = await clearChartDrawingsFn({ data: { marketKey } })
  invalidateDashboardBootstrap()
  return answer
}

export const getDrawingsErrorMessage = createErrorMessage(
  {
    [DRAWINGS_FULL]: `This market already has ${MAX_DRAWINGS_PER_MARKET} drawings. Delete one to make room.`,
  },
  "That drawing did not save. Try it again."
)

export const getLineAlertsLoadErrorMessage = createErrorMessage(
  {},
  "Your line alerts could not be loaded. Try again."
)

export const getDrawingAlertErrorMessage = createErrorMessage(
  {
    [DRAWING_ALERT_NO_PRICE]:
      "There is no live price to set the alert from yet. Try again in a moment.",
    [DRAWING_ALERT_NOT_ARMED]:
      "That line's alert is no longer on, so there is nothing to set a buffer on. Switch it on again.",
  },
  "The alert did not save. Try it again."
)

export const getDrawingsLoadErrorMessage = createErrorMessage(
  {},
  "Your drawings for this market could not be loaded."
)
