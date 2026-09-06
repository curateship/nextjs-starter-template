import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { userGet } from "@/server/guards"
import {
  loadOlderPnlJournal,
  loadPnlPage,
  type PnlJournalPage,
  type PnlPage,
} from "@/server/trade/pnl"

import { createErrorMessage } from "../error-message"

export type { PnlJournalPage, PnlPage }

const loadPnlPageFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .handler(({ context }): Promise<PnlPage> => loadPnlPage(context.user.id))

const olderSchema = z.object({
  paper: z.number().int().positive().nullable(),
  live: z.number().int().positive().nullable(),
})

const loadOlderPnlJournalFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(olderSchema)
  .handler(({ data, context }): Promise<PnlJournalPage> =>
    loadOlderPnlJournal(context.user.id, data)
  )

export function loadPnlPageData() {
  return loadPnlPageFn()
}

export function loadOlderPnlJournalPage(before: z.infer<typeof olderSchema>) {
  return loadOlderPnlJournalFn({ data: before })
}

export const getPnlErrorMessage = createErrorMessage(
  {},
  "The P&L page could not be read. Try again."
)
