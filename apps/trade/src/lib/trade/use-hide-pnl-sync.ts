import * as React from "react"

import { useEffectBeforePaint } from "@/lib/hooks/use-effect-before-paint"
import { loadHidePnl } from "@/lib/api/trade/hide-pnl"
import {
  HIDE_PNL_STORAGE_KEY,
  hidePnlVersion,
  setHidePnl,
  startHidePnl,
} from "@/lib/trade/hide-pnl"

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
  // Every other open copy of Trade follows the switch at once: another tab,
  // or another Trade screen kept loaded in Personal's middle panel. Each copy
  // keeps the answer in its own memory and reads the saved one only as it
  // opens, so before this a copy opened earlier kept showing the figures
  // until it was loaded again. The browser tells every other page of the
  // same address when the remembered answer changes. Tyler found it on
  // 18 Oct 2026, with the switch off in one copy and on in Personal's.
  React.useEffect(() => {
    function onStorage(event: StorageEvent) {
      if (event.key !== HIDE_PNL_STORAGE_KEY || event.newValue === null) return
      setHidePnl(event.newValue === "true")
    }
    window.addEventListener("storage", onStorage)
    return () => window.removeEventListener("storage", onStorage)
  }, [])
}
