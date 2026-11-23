import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { loadWhatIf, type WhatIfPage } from "@/server/free-tools/what-if"

const askedSchema = z
  .object({
    kind: z.enum(["coin", "stock"]),
    symbol: z.string().regex(/^[A-Za-z0-9]{1,20}$/),
  })
  .nullable()

/**
 * "What if I had bought"'s offered markets and one market's stored daily
 * closes, open to anybody: `/tools/what-if` is a public page for visitors
 * with no account. The reason it may stay open is written down in
 * `src/app/open-endpoints.ts`.
 */
const readWhatIfFn = createServerFn({ method: "GET" })
  .inputValidator(askedSchema)
  .handler(({ data }): Promise<WhatIfPage> => loadWhatIf(data))

export function readWhatIf(asked: z.infer<typeof askedSchema>) {
  return readWhatIfFn({ data: asked })
}
