import { z } from "zod"

export const ASTER_MARGIN_MODES = ["isolated", "cross"] as const

export const asterMarginModeSchema = z.enum(ASTER_MARGIN_MODES)

export type AsterMarginMode = z.infer<typeof asterMarginModeSchema>

export type AsterMarginModeSetting = {
  walletId: string
  label: string
  mode: AsterMarginMode
}
