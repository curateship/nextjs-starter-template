import { createServerFn } from "@tanstack/react-start"

import { createErrorMessage } from "@/lib/api/error-message"
import type { AsterMarginModeSetting } from "@/lib/trade/aster-margin-mode"
import type { LiquidationWarning } from "@/lib/trade/liquidation-warning"
import type { OrderStyle } from "@/lib/trade/order-style"
import type { WorkersDashboard } from "@/lib/trade/workers"
import { adminGet } from "@/server/guards"
import { loadRememberedAsterMarginModeSettings } from "@/server/protocols/aster-margin-mode"
import { loadLiquidationWarning, loadOrderStyle } from "@/server/trade/prefs"
import { workersDashboard } from "@/server/trade/workers"

export type TradingEngineSettingsPage = {
  workers: WorkersDashboard
  liquidationWarning: LiquidationWarning
  asterMargins: AsterMarginModeSetting[] | null
  orderStyle: OrderStyle
}

const loadFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .handler(async ({ context }): Promise<TradingEngineSettingsPage> => {
    const [workers, liquidationWarning, asterMargins, orderStyle] =
      await Promise.all([
        workersDashboard(true),
        loadLiquidationWarning(context.user.id),
        loadRememberedAsterMarginModeSettings(context.user.id).catch(
          () => null
        ),
        loadOrderStyle(context.user.id),
      ])

    return { workers, liquidationWarning, asterMargins, orderStyle }
  })

export function loadTradingEngineSettingsPage() {
  return loadFn()
}

export const getTradingEngineSettingsErrorMessage = createErrorMessage(
  {},
  "The trading engine settings could not be loaded. Try again."
)
