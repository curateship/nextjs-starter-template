import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { createErrorMessage } from "@/lib/api/error-message"
import { invalidateDashboardBootstrap } from "@/lib/trade/dashboard-bootstrap-cache"
import {
  tradingRulesSchema,
  type TradingRules,
} from "@/lib/trade/trading-rules"
import { userGet, userPost } from "@/server/guards"
import { loadTradingRules, saveTradingRules } from "@/server/trade/prefs"

const saveTradingRulesSchema = z.object({ rules: tradingRulesSchema })

const loadTradingRulesFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .handler(async ({ context }): Promise<{ rules: TradingRules }> => ({
    rules: await loadTradingRules(context.user.id),
  }))

const saveTradingRulesFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(saveTradingRulesSchema)
  .handler(async ({ data, context }): Promise<{ saved: true }> => {
    await saveTradingRules(context.user.id, data.rules)
    return { saved: true }
  })

export function loadTradingRulesSettings() {
  return loadTradingRulesFn()
}

export async function saveTradingRulesSettings(rules: TradingRules) {
  const answer = await saveTradingRulesFn({ data: { rules } })
  // The dashboard carries the rules in its opening answer; the next visit
  // must open on the rules as they are now, not as they were a minute ago.
  invalidateDashboardBootstrap()
  return answer
}

export const getTradingRulesLoadErrorMessage = createErrorMessage(
  {},
  "Your trading rules could not be loaded. Try again."
)

export const getTradingRulesSaveErrorMessage = createErrorMessage(
  {},
  "That rule was not saved. The screen still shows your choice, but it will be back to how it was after a reload."
)
