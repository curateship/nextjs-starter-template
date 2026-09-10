import { QuickSettingSwitch } from "@/components/ui/quick-setting-row"
import { saveHidePnl } from "@/lib/api/trade/hide-pnl"
import { setHidePnl, useHidePnl } from "@/lib/trade/hide-pnl"
import { useHidePnlSync } from "@/lib/trade/use-hide-pnl-sync"
import { showErrorToast } from "@/lib/toast/error-toast"

/**
 * Trade's row in the header's settings menu: hide every figure that says what
 * you made or lost.
 *
 * It sits in the header because the header is on every screen, so the switch
 * is reached the same way from the trading workspace, the P&L page and a
 * backtest. Reading the saved answer is `use-hide-pnl-sync.ts`'s job rather
 * than this row's, because a menu draws nothing until somebody opens it.
 */
export default function HidePnlSetting() {
  const hidden = useHidePnl()
  // Asked for again in case this menu was opened on a page whose header never
  // ran it. The request is made once per page either way.
  useHidePnlSync()

  return (
    <QuickSettingSwitch
      id="hide-pnl"
      label="Hide profit and loss"
      hint="Blurs what you made or lost. Balances and prices stay."
      checked={hidden}
      onChange={(next) => {
        setHidePnl(next)
        void saveHidePnl(next).catch(() => {
          showErrorToast("That choice could not be saved. Try again.")
        })
      }}
    />
  )
}
