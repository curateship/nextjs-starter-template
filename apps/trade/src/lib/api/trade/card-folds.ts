import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { cardFoldsSchema, type CardFolds } from "@/lib/trade/card-folds"
import { userGet, userPost } from "@/server/guards"
import { loadCardFolds, saveCardFolds } from "@/server/trade/prefs"

import { createErrorMessage } from "../error-message"

/**
 * Which settings cards a person has folded away, kept against the account.
 *
 * Server-side rather than in the browser's own storage, the same as the chart's
 * zoom and its indicators, and for the same reason: this app runs inside an
 * embedded preview where those writes are quietly dropped.
 */

const saveCardFoldsSchema = z.object({ folds: cardFoldsSchema })

const loadCardFoldsFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .handler(async ({ context }): Promise<{ folds: CardFolds }> => {
    return { folds: await loadCardFolds(context.user.id) }
  })

const saveCardFoldsFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(saveCardFoldsSchema)
  .handler(async ({ data, context }): Promise<{ saved: true }> => {
    await saveCardFolds(context.user.id, data.folds)
    return { saved: true }
  })

export function loadRememberedFolds(): Promise<{ folds: CardFolds }> {
  return loadCardFoldsFn()
}

export function saveRememberedFolds(folds: CardFolds): Promise<{ saved: true }> {
  return saveCardFoldsFn({ data: { folds } })
}

/**
 * Losing this loses how a window was arranged and nothing else, so it is said
 * quietly and the card stays where it was put.
 */
export const getCardFoldsErrorMessage = createErrorMessage(
  {},
  "That fold was not remembered. The card is still where you put it, but it will be back to how it was after a reload."
)
