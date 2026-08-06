import { ListIcon, SearchIcon } from "lucide-react"

import { WorkspacePanelHeader } from "@/components/shared/workspace-panel-header"
import { PanelPlaceholder } from "@/components/trade/panel-placeholder"

/** The left panel: finding a market. Search, favourites, filters and the list. */
export function MarketListPanel() {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <WorkspacePanelHeader
        icon={<ListIcon className="size-4" />}
        title="Markets"
      />
      <div className="min-h-0 flex-1">
        <PanelPlaceholder
          icon={<SearchIcon className="size-4" />}
          title="Pick a market to chart it"
        >
          Search, favourites and the market list arrive here next.
        </PanelPlaceholder>
      </div>
    </div>
  )
}
