import { useEffectBeforePaint } from "@/lib/hooks/use-effect-before-paint"
import { loadHidePnl } from "@/lib/api/trade/hide-pnl"
import { hidePnlVersion, setHidePnl, startHidePnl } from "@/lib/trade/hide-pnl"

/**
 * Brings the saved Hide profit and loss choice into the browser, once a page.
 *
 * **It cannot live in the switch itself.** The switch is a row inside the
 * header's settings menu, and a menu draws nothing until it is opened — so a
 * page would sit with every figure readable until somebody happened to open
 * the cog, which is the one moment they least need it. This runs from the
 * header's own always-drawn control instead.
 *
 * The browser's remembered answer is applied before the first paint, then the
 * server's is asked for once and wins. `asked` keeps the second caller on a
 * page from making the same request twice; a refused read clears it so the
 * next page can try again.
 */
let asked = false

export function useHidePnlSync() {
  useEffectBeforePaint(() => {
    const remembered = startHidePnl()
    if (remembered !== null) setHidePnl(remembered)
    if (asked) return
    asked = true
    // Read after the remembered answer has been applied, so only a person
    // pressing the switch in the meantime counts as newer than this read.
    const at = hidePnlVersion()
    void loadHidePnl()
      .then((answer) => {
        if (hidePnlVersion() === at) setHidePnl(answer.hidden)
      })
      .catch(() => {
        asked = false
      })
  }, [])
}
