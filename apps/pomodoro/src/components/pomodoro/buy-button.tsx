import * as React from "react"
import { Loader2Icon, ShoppingBagIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  buyPomodoroProduct,
  getPurchaseErrorMessage,
} from "@/lib/api/pomodoro/purchases"
import type { PurchaseProduct } from "@/lib/pomodoro/purchases"
import { showErrorToast } from "@/lib/toast/error-toast"

/**
 * One-off purchase button (uploads-and-sharing task 07): asks the server for
 * Stripe's checkout and goes there. The price is the server's; the label only
 * repeats it. Stripe sends the member back to the tab they bought from.
 */
export function BuyButton({
  product,
  page,
  label,
  variant = "outline",
}: {
  product: PurchaseProduct
  page: "background" | "sound"
  label: string
  variant?: "outline" | "ghost"
}) {
  const [busy, setBusy] = React.useState(false)
  async function buy() {
    setBusy(true)
    try {
      const { url } = await buyPomodoroProduct(product, page)
      window.location.assign(url)
    } catch (error) {
      showErrorToast(getPurchaseErrorMessage(error))
      setBusy(false)
    }
  }
  return (
    <Button type="button" variant={variant} onClick={() => void buy()} disabled={busy}>
      {busy ? (
        <Loader2Icon className="animate-spin" aria-hidden="true" />
      ) : (
        <ShoppingBagIcon aria-hidden="true" />
      )}
      {label}
    </Button>
  )
}
