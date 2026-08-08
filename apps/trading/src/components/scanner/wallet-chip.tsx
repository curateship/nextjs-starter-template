import { EyeOffIcon, StarIcon } from "lucide-react"

import { shortAddress } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { ScannerWalletInfo } from "@/lib/api/scanner"

/**
 * Compact wallet identity chip for trade feeds: label (or short address)
 * plus tracked/ignored markers. Click behavior comes from the parent.
 */
export function WalletChip({
  address,
  wallet,
  onClick,
}: {
  address: string
  wallet: ScannerWalletInfo | null
  onClick?: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex max-w-[160px] items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 font-mono text-xs",
        "hover:bg-accent hover:text-accent-foreground",
        wallet?.tracked && "ring-1 ring-primary/40",
        wallet?.ignored && "opacity-50"
      )}
      title={address}
    >
      {wallet?.tracked ? (
        <StarIcon className="size-3 shrink-0 fill-current text-primary" />
      ) : null}
      {wallet?.ignored ? <EyeOffIcon className="size-3 shrink-0" /> : null}
      <span className="truncate">
        {wallet?.label ? wallet.label : shortAddress(address)}
      </span>
    </button>
  )
}
