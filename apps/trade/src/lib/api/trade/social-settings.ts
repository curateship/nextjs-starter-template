import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { createErrorMessage } from "@/lib/api/error-message"
import { userGet, userPost } from "@/server/guards"
import {
  loadSocialMatchStocks,
  saveSocialMatchStocks,
} from "@/server/trade/prefs"
import { catchUpAfterStocksSwitch } from "@/server/trade/social-post-coins"

/**
 * The one Social setting: whether a post's words are read for stocks, metals
 * and currencies as well as coins.
 *
 * **Saving it also catches the stored answers up**, in the same request, so
 * the switch is never a setting that appears to do nothing. Switching off
 * drops every stock row the member holds; switching on marks their posts
 * unread so each creator is read again the next time it is opened.
 */

const stocksSchema = z.object({ stocks: z.boolean() })

const loadSocialMatchStocksFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .handler(async ({ context }) =>
    stocksSchema.parse({ stocks: await loadSocialMatchStocks(context.user.id) })
  )

const saveSocialMatchStocksFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(stocksSchema)
  .handler(async ({ data, context }) => {
    const stocks = await saveSocialMatchStocks(context.user.id, data.stocks)
    await catchUpAfterStocksSwitch(context.user.id, stocks)
    return stocksSchema.parse({ stocks })
  })

export async function loadSocialStocksSetting(): Promise<boolean> {
  return (await loadSocialMatchStocksFn()).stocks
}

export async function saveSocialStocksSetting(
  stocks: boolean
): Promise<boolean> {
  return (await saveSocialMatchStocksFn({ data: { stocks } })).stocks
}

export const getSocialStocksLoadErrorMessage = createErrorMessage(
  {},
  "The stocks setting could not be loaded. Try again."
)

export const getSocialStocksSaveErrorMessage = createErrorMessage(
  {},
  "The stocks setting could not be saved. Try again."
)
