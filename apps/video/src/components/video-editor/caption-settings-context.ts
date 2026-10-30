import * as React from "react"

import { useEditorSelector } from "@/components/video-editor/editor-store"
import {
  DEFAULT_CAPTION_SETTINGS,
  type CaptionPlacement,
  type CaptionSettings,
} from "@/lib/video/caption-look"
import { SAFE_BOX_ASPECT, safeBoxShares } from "@/lib/video/safe-box"

/**
 * The caption look and safe boxes saved on Settings → Captions, read with the
 * project when the editor opens. A guest sent from Project has no AI tools,
 * so nothing lays captions for them and the standard look stands in.
 */
const CaptionSettingsContext = React.createContext<CaptionSettings>(
  DEFAULT_CAPTION_SETTINGS
)

export const CaptionSettingsProvider = CaptionSettingsContext.Provider

/** The saved look and boxes, as Settings last saved them. */
export function useCaptionSettings() {
  return React.useContext(CaptionSettingsContext)
}

/** Where captions laid now go: the saved look, on this project's shape. */
export function useCaptionPlacement(): CaptionPlacement {
  const settings = useCaptionSettings()
  const aspect = useEditorSelector((state) => state.aspect)
  return React.useMemo(() => ({ ...settings, aspect }), [settings, aspect])
}

const NO_INSET = { top: 0, bottom: 0, left: 0, right: 0 }

/**
 * How much of each edge the platform new captions are fitted for covers, as a
 * share of the frame. Nothing on a project that is not tall, or with no
 * platform picked, because the safe box only exists for a tall frame.
 */
export function usePlatformInset() {
  const { look, safeBoxes } = useCaptionSettings()
  const aspect = useEditorSelector((state) => state.aspect)
  return React.useMemo(
    () =>
      look.platform && aspect === SAFE_BOX_ASPECT
        ? safeBoxShares(safeBoxes[look.platform])
        : NO_INSET,
    [look.platform, safeBoxes, aspect]
  )
}
