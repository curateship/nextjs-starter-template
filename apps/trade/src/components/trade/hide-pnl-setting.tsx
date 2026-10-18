import { QuickSettingSwitch } from "@/components/ui/quick-setting-row"
import { saveHidePnl } from "@/lib/api/trade/hide-pnl"
import { setHidePnl, useHidePnl } from "@/lib/trade/hide-pnl"
import { showErrorToast } from "@/lib/toast/error-toast"

/**
 * Trade's row in the header's settings menu: hide every figure that says what
 * you made or lost.
 *
 * It sits in the header because the header is on every screen, so the switch
 * is reached the same way from the trading workspace, the P&L page and a
 * backtest. The saved answer is read by `useHidePnl` in
 * `src/lib/trade/hide-pnl.ts`, wherever a figure is drawn.
 */
export default function HidePnlSetting() {
  const hidden = useHidePnl()

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
