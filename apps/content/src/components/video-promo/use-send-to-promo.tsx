import * as React from "react"

import { SendToPromoDialog, type PromoSendTarget } from "@/components/video-promo/send-to-promo-dialog"
import { getPromoErrorMessage, loadPromoTarget } from "@/lib/api/video/promo"
import { showErrorToast } from "@/lib/toast/error-toast"

/**
 * Send to Promo from a menu or a card (parts 8 and 9): looks up the newest
 * finished export, or the one named, then opens the send window. With no
 * finished export yet it says so, because only a file can go to Promo.
 */
export function useSendToPromo(onSent?: () => void) {
  const [target, setTarget] = React.useState<PromoSendTarget | null>(null)

  const open = React.useCallback(async (which: { exportId?: string; videoId?: string; carouselId?: string }) => {
    try {
      const found = await loadPromoTarget(which)
      if (!found) {
        showErrorToast(
          which.carouselId
            ? "Export it first. Only a finished carousel export can go to Promo."
            : "Export it first. Only a finished export can go to Promo."
        )
        return
      }
      setTarget({
        name: found.name,
        kind: found.kind,
        exportIds: [found.exportId],
        sourceProjectId: found.sourceProjectId,
        hasLanguageCopies: found.hasLanguageCopies,
        earlier: found.earlier,
      })
    } catch (error) {
      showErrorToast(getPromoErrorMessage(error))
    }
  }, [])

  const dialog = target ? (
    <SendToPromoDialog target={target} onClose={() => setTarget(null)} onSent={onSent} />
  ) : null

  return { open, dialog }
}
