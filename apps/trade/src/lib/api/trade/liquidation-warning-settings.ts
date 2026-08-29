import { createServerFn } from "@tanstack/react-start"

import { createErrorMessage } from "@/lib/api/error-message"
import {
  liquidationWarningSchema,
  type LiquidationWarning,
} from "@/lib/trade/liquidation-warning"
import { userGet, userPost } from "@/server/guards"
import {
  loadLiquidationWarning,
  saveLiquidationWarning,
} from "@/server/trade/prefs"

const loadFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .handler(({ context }) => loadLiquidationWarning(context.user.id))

const saveFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(liquidationWarningSchema)
  .handler(({ data, context }) => saveLiquidationWarning(context.user.id, data))

export function loadLiquidationWarningSettings() {
  return loadFn()
}

export function saveLiquidationWarningSettings(value: LiquidationWarning) {
  return saveFn({ data: value })
}

export const getLiquidationWarningLoadErrorMessage = createErrorMessage(
  {},
  "The liquidation warning could not be loaded. Try again."
)

export const getLiquidationWarningSaveErrorMessage = createErrorMessage(
  {},
  "The liquidation warning could not be saved. Try again."
)
