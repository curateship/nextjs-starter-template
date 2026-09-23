import * as React from "react"

import { getBrandKitErrorMessage, loadBrandKit } from "@/lib/api/video/settings"
import { showErrorToast } from "@/lib/toast/error-toast"
import {
  DEFAULT_CAPTION_LOOK,
  type CaptionLook,
} from "@/lib/video/caption-look"

/**
 * The look saved in the brand kit, read afresh each time a window that writes
 * captions opens, so a look saved a moment ago in the Brand panel is the one
 * used. Null until it arrives. If the kit cannot be read, the window says so
 * and starts from the standard look instead of refusing to caption.
 */
export function useSavedCaptionLook(open: boolean) {
  const [look, setLook] = React.useState<CaptionLook | null>(null)

  const [wasOpen, setWasOpen] = React.useState(open)
  if (wasOpen !== open) {
    setWasOpen(open)
    if (open) setLook(null)
  }

  React.useEffect(() => {
    if (!open) return
    let active = true
    loadBrandKit()
      .then((kit) => {
        if (active) setLook(kit.captions)
      })
      .catch((error) => {
        if (!active) return
        setLook({ ...DEFAULT_CAPTION_LOOK })
        showErrorToast(
          `${getBrandKitErrorMessage(error)} The saved caption look could not be read, so these are the standard settings.`
        )
      })
    return () => {
      active = false
    }
  }, [open])

  return [look, setLook] as const
}
