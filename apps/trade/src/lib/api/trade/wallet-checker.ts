import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import type { WalletCheckReport } from "@/lib/free-tools/wallet-checker"
import { requestIp, requireAppOrigin } from "@/server/auth/origin"
import { checkWallet } from "@/server/free-tools/wallet-checker"

/**
 * The wallet checker's one door (`/tools/wallet-checker`), open to visitors
 * with no account. The reason it may stay open is written down in
 * `src/app/open-endpoints.ts`.
 *
 * A POST rather than a GET, because it spends a share of the exchange's
 * request budget: that makes it an action, and it is the method the browser
 * sends an Origin header with, which is what `requireAppOrigin` reads.
 */
const checkWalletFn = createServerFn({ method: "POST" })
  // Long enough for any address plus stray spaces, short enough that a
  // megabyte of text never reaches the check.
  .inputValidator(z.object({ address: z.string().max(100) }))
  .handler(({ data }): Promise<WalletCheckReport> => {
    requireAppOrigin()
    return checkWallet(data.address, requestIp())
  })

export function checkWalletAddress(address: string) {
  return checkWalletFn({ data: { address } })
}
