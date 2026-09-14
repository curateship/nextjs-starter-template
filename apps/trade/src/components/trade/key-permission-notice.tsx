import { TriangleAlertIcon } from "lucide-react"
import type { TradeWallet } from "@/lib/trade/wallets"
import { WARNING_SURFACE } from "@/lib/trade/money-tone"
import { cn } from "@/lib/utils"

/**
 * What a live wallet's trading key may do.
 *
 * A key that can withdraw money is always said, wherever the wallet is drawn.
 * The safe answer, "Trade-only key", is only said where there is room to read
 * it: the wallet windows. The account panel's rows pass `sayWhenSafe={false}`
 * so a safe key adds no second line under every wallet (Tyler, 13 Sep 2026).
 */
export function KeyPermissionNotice({
  wallet,
  sayWhenSafe = true,
  className,
}: {
  wallet: TradeWallet
  sayWhenSafe?: boolean
  className?: string
}) {
  if (wallet.kind !== "live") return null
  if (wallet.keyPermission === "trade-only") {
    if (!sayWhenSafe) return null
    return (
      <span className={cn("block text-xs text-muted-foreground", className)}>
        Trade-only key
      </span>
    )
  }
  const withdraws = wallet.keyPermission === "can-withdraw"
  return (
    <span
      role={withdraws ? "alert" : "status"}
      className={cn(
        "flex items-start gap-2 rounded-md p-2 text-xs",
        WARNING_SURFACE,
        className
      )}
    >
      <TriangleAlertIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span>
        <span className="block font-medium">
          {withdraws
            ? "This key can withdraw money"
            : "Could not check what this key may do"}
        </span>
        <span>
          {withdraws
            ? "Replace this key with a trade-only key on your exchange. Trading is still allowed."
            : "Check the key's permissions on your exchange. Use a trade-only key with withdrawals disabled."}
        </span>
      </span>
    </span>
  )
}
