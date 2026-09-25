import { createServerFn } from "@tanstack/react-start"

import type { ConverterPrices } from "@/lib/free-tools/price-converter"
import { loadConverterPrices } from "@/server/free-tools/price-converter"

/**
 * The price converter's prices, open to anybody: `/tools/convert` is a public
 * page for visitors with no account. It reads what the server already holds
 * and takes no input. The reason it may stay open is written down in
 * `src/app/open-endpoints.ts`.
 */
const readConverterPricesFn = createServerFn({ method: "GET" }).handler(
  (): Promise<ConverterPrices> => loadConverterPrices()
)

export function readConverterPrices() {
  return readConverterPricesFn()
}

