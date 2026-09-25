import type { NetworkId, WalletOrderFill } from "@/lib/protocols/contracts"
import { fetchKucoinPushedFill } from "@/server/protocols/kucoin/orders"
import {
  kucoinFillsNeedRecovery,
  watchKucoinOrderMatches,
} from "@/server/protocols/kucoin/private-feed"
import { scrubbedMessage } from "@/server/protocols/scrub"

const pending = new Set<string>()

/**
 * KuCoin's socket names an execution but omits its fee. Read that execution
 * from recent history before storing it. The complete recovery sweep assigns
 * the position's money once, after all closing pieces can be read together.
 */
export function watchKucoinFills(
  network: NetworkId,
  keyId: string,
  listenerId: string,
  credential: () => string | null,
  onFill: (fill: WalletOrderFill) => void
): void {
  watchKucoinOrderMatches(network, keyId, listenerId, credential, (match) => {
    const key = `${network}:${keyId}:${match.tradeId}`
    if (pending.has(key)) return
    pending.add(key)
    void fetchKucoinPushedFill(network, match, credential)
      .then((fill) => {
        if (fill) onFill(fill)
      })
      .catch((error) => {
        // The ordinary recovery sweep remains responsible for this fill.
        console.error("KuCoin pushed fill read failed", scrubbedMessage(error))
      })
      .finally(() => pending.delete(key))
  })
}

export { kucoinFillsNeedRecovery }
