import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { createErrorMessage } from "@/lib/api/error-message"
import { asterMarginModeSchema } from "@/lib/trade/aster-margin-mode"
import { userGet, userPost } from "@/server/guards"
import {
  loadAsterMarginModeSettings,
  saveAsterMarginModeSetting,
} from "@/server/protocols/aster-margin-mode"
import { runLiveOrderAction } from "@/server/trade/order-rate-limit"

const loadFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .handler(({ context }) => loadAsterMarginModeSettings(context.user.id))

const saveFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(
    z.object({
      walletId: z.string().max(36),
      mode: asterMarginModeSchema,
    })
  )
  .handler(({ data, context }) =>
    runLiveOrderAction(context.user.id, "order", () =>
      saveAsterMarginModeSetting(context.user.id, data.walletId, data.mode)
    )
  )

export function loadAsterMarginModes() {
  return loadFn()
}

export function saveAsterMarginMode(
  walletId: string,
  mode: z.infer<typeof asterMarginModeSchema>
) {
  return saveFn({ data: { walletId, mode } })
}

export const getAsterMarginModeLoadErrorMessage = createErrorMessage(
  {},
  "Aster's margin setting could not be loaded. Try again."
)

export const getAsterMarginModeSaveErrorMessage = createErrorMessage(
  {
    TRADE_ORDER_RATE_LIMITED:
      "The app is sending orders too fast. Try again in a moment.",
    LIVE_MARGIN_MODE:
      "Aster would not change the account margin setting. Close any open Aster positions or orders, then try again.",
    LIVE_MAINNET_OFF:
      "Turn on real-money trading before changing Aster's margin setting.",
    WALLET_INACTIVE: "Switch this Aster wallet on before changing its margin.",
  },
  "Aster's margin setting could not be changed. Try again."
)
