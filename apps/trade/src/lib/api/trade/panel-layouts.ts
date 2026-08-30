import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { TRADE_PANEL_LAYOUT_KEYS } from "@/lib/trade/panel-keys"
import type { TradePanelLayouts } from "@/lib/trade/panel-layout"
import { userPost } from "@/server/guards"
import {
  applyNamedTradePanelLayout,
  createNamedTradePanelLayout,
  deleteNamedTradePanelLayout,
  importLegacyTradePanelLayouts,
  saveTradePanelLayout,
} from "@/server/trade/prefs"

import { createErrorMessage } from "../error-message"

const layoutKeySchema = z.enum(TRADE_PANEL_LAYOUT_KEYS)
const layoutSchema = z
  .record(z.string().min(1).max(40), z.number().finite().min(0).max(100))
  .refine((layout) => Object.keys(layout).length <= 3)

const savePanelLayoutFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ key: layoutKeySchema, layout: layoutSchema }))
  .handler(async ({ data, context }): Promise<{ saved: true }> => {
    await saveTradePanelLayout(context.user.id, data.key, data.layout)
    return { saved: true }
  })

const importLegacyPanelLayoutsFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(
    z.object({ current: z.partialRecord(layoutKeySchema, layoutSchema) })
  )
  .handler(async ({ data, context }): Promise<TradePanelLayouts> => {
    return importLegacyTradePanelLayouts(context.user.id, data.current)
  })

const createNamedPanelLayoutFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(
    z.object({
      name: z.string().trim().min(1).max(32),
      horizontal: layoutSchema,
      vertical: layoutSchema,
    })
  )
  .handler(async ({ data, context }): Promise<TradePanelLayouts> => {
    return createNamedTradePanelLayout(context.user.id, data)
  })

const namedIdSchema = z.object({ id: z.string().min(1).max(36) })

const applyNamedPanelLayoutFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(namedIdSchema)
  .handler(async ({ data, context }): Promise<TradePanelLayouts> => {
    return applyNamedTradePanelLayout(context.user.id, data.id)
  })

const deleteNamedPanelLayoutFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(namedIdSchema)
  .handler(async ({ data, context }): Promise<TradePanelLayouts> => {
    return deleteNamedTradePanelLayout(context.user.id, data.id)
  })

export function savePanelLayout(
  key: (typeof TRADE_PANEL_LAYOUT_KEYS)[number],
  layout: Record<string, number>
) {
  return savePanelLayoutFn({ data: { key, layout } })
}

export function importLegacyPanelLayouts(
  current: TradePanelLayouts["current"]
) {
  return importLegacyPanelLayoutsFn({ data: { current } })
}

export function createNamedPanelLayout(input: {
  name: string
  horizontal: Record<string, number>
  vertical: Record<string, number>
}) {
  return createNamedPanelLayoutFn({ data: input })
}

export function applyNamedPanelLayout(id: string) {
  return applyNamedPanelLayoutFn({ data: { id } })
}

export function deleteNamedPanelLayout(id: string) {
  return deleteNamedPanelLayoutFn({ data: { id } })
}

export const getPanelLayoutErrorMessage = createErrorMessage(
  {
    PANEL_LAYOUT_NAME_TAKEN: "A saved layout already uses that name.",
    PANEL_LAYOUT_LIMIT: "You can keep up to five saved layouts.",
    PANEL_LAYOUT_NOT_FOUND: "That saved layout is not here any more.",
    PANEL_LAYOUT_INVALID: "That panel arrangement could not be saved.",
  },
  "The panel arrangement could not be saved. Try again."
)
