import { TriangleAlertIcon } from "lucide-react"
import type { TradeWallet } from "@/lib/trade/wallets"
import { WARNING_SURFACE } from "@/lib/trade/money-tone"
import { cn } from "@/lib/utils"

export function KeyPermissionNotice({ wallet }: { wallet: TradeWallet }) {
  if (wallet.kind !== "live") return null
  if (wallet.keyPermission === "trade-only") {
    return (
      <span className="block text-xs text-muted-foreground">
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
        WARNING_SURFACE
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
