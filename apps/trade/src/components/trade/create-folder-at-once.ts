import {
  createFolder,
  getMarketFolderErrorMessage,
} from "@/lib/api/trade/market-folders"
import type { NetworkId, ProtocolId } from "@/lib/protocols/contracts"
import type { MarketFolder } from "@/lib/trade/market-folders"
import { showErrorToast } from "@/lib/toast/error-toast"

/**
 * Makes a folder and shows it at once, before the server has answered (Tyler,
 * 8 Nov 2026: "i cant create folders"). The save took three to four seconds
 * with nothing on screen moving, so a press read as doing nothing. The new
 * folder joins the list straight away, empty and last; the server's answer
 * then replaces the whole list with what it saved. A refusal, such as a name
 * the exchange's folders already have, takes it back out and says why.
 *
 * Answers whether the folder was saved.
 */
export async function createFolderAtOnce({
  protocol,
  network,
  name,
  folders,
  onFoldersChange,
}: {
  protocol: ProtocolId
  network: NetworkId
  name: string
  folders: readonly MarketFolder[]
  onFoldersChange: (folders: MarketFolder[]) => void
}): Promise<boolean> {
  const showing: MarketFolder = {
    id: `new:${crypto.randomUUID()}`,
    name,
    isFav: false,
    position: Math.max(0, ...folders.map((folder) => folder.position)) + 1,
    hidden: false,
    marketKeys: [],
  }
  onFoldersChange([...folders, showing])
  try {
    onFoldersChange(await createFolder({ protocol, network, name }))
    return true
  } catch (error) {
    onFoldersChange([...folders])
    showErrorToast(getMarketFolderErrorMessage(error))
    return false
  }
}
