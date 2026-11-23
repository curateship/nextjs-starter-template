import { MarketFolderStar } from "@/components/trade/market-folder-star"
import type { MarketRow, ProtocolId } from "@/lib/protocols/contracts"
import { favFolder } from "@/lib/trade/market-folders"
import { showErrorToast } from "@/lib/toast/error-toast"
import type { useExplorerFolders } from "./use-explorer-folders"

export function ExplorerStar({
  row,
  protocol,
  state,
}: {
  row: MarketRow
  protocol: ProtocolId
  state: ReturnType<typeof useExplorerFolders>
}) {
  const folders = state.folders[protocol] ?? []
  return (
    <MarketFolderStar
      compact
      symbol={row.symbol}
      marketKey={row.key}
      folders={folders}
      busy={state.busy}
      onQuickAdd={() => {
        const fav = favFolder(folders)
        if (fav) void state.toggle(protocol, row, fav.id, true)
        else showErrorToast("Fav has not loaded. Reload Markets and try again.")
      }}
      onToggle={(id, saved) => state.toggle(protocol, row, id, saved)}
      onCreate={(name) => state.create(protocol, row, name)}
    />
  )
}
