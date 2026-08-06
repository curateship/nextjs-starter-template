import { StarIcon } from "lucide-react"

import { WorkspacePanelHeader } from "@/components/shared/workspace-panel-header"
import { PanelPlaceholder } from "@/components/trade/panel-placeholder"

/**
 * The lower row of the left panel: the handful of markets you actually watch.
 *
 * Its own row rather than a tab inside the list above, because the two answer
 * different questions — "what else is there" and "what am I keeping an eye on"
 * — and a tab makes you give up one to see the other.
 */
export function FavouritesPanel() {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <WorkspacePanelHeader
        icon={<StarIcon className="size-4" />}
        title="Favourites"
      />
      <div className="min-h-0 flex-1">
        <PanelPlaceholder
          icon={<StarIcon className="size-4" />}
          title="Nothing starred yet"
        >
          Star a market in the list above and it stays here.
        </PanelPlaceholder>
      </div>
    </div>
  )
}
