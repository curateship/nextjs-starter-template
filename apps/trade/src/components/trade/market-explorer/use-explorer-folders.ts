import * as React from "react"

import {
  createFolder,
  getMarketFolderErrorMessage,
  loadFolders,
  setFolderMarket,
} from "@/lib/api/trade/market-folders"
import type { MarketRow, ProtocolId } from "@/lib/protocols/contracts"
import { type MarketFolder } from "@/lib/trade/market-folders"
import { showErrorToast } from "@/lib/toast/error-toast"

export function useExplorerFolders(protocols: readonly ProtocolId[]) {
  const [folders, setFolders] = React.useState<
    Partial<Record<ProtocolId, MarketFolder[]>>
  >({})
  const [busy, setBusy] = React.useState(false)
  const saving = React.useRef(false)
  const signature = protocols.join("|")
  React.useEffect(() => {
    let alive = true
    for (const protocol of signature
      .split("|")
      .filter(Boolean) as ProtocolId[]) {
      void loadFolders(protocol, "mainnet")
        .then((answer) => {
          if (alive)
            setFolders((current) => ({ ...current, [protocol]: answer }))
        })
        .catch(() => {
          if (alive)
            showErrorToast(
              "Market folders could not be loaded. Reload Markets to retry."
            )
        })
    }
    return () => {
      alive = false
    }
  }, [signature])
  async function toggle(
    protocol: ProtocolId,
    row: MarketRow,
    folderId: string,
    saved: boolean
  ) {
    if (saving.current) return
    saving.current = true
    setBusy(true)
    const previous = folders[protocol] ?? []
    setFolders((current) => ({
      ...current,
      [protocol]: previous.map((folder) =>
        folder.id !== folderId
          ? folder
          : {
              ...folder,
              marketKeys: saved
                ? [...new Set([...folder.marketKeys, row.key])]
                : folder.marketKeys.filter((key) => key !== row.key),
            }
      ),
    }))
    try {
      await setFolderMarket({ folderId, marketKey: row.key, saved })
    } catch (error) {
      setFolders((current) => ({ ...current, [protocol]: previous }))
      showErrorToast(getMarketFolderErrorMessage(error))
    } finally {
      saving.current = false
      setBusy(false)
    }
  }
  async function create(protocol: ProtocolId, row: MarketRow, name: string) {
    if (saving.current) return false
    saving.current = true
    setBusy(true)
    try {
      const answer = await createFolder({
        protocol,
        network: "mainnet",
        name,
        marketKey: row.key,
      })
      setFolders((current) => ({ ...current, [protocol]: answer }))
      return true
    } catch (error) {
      showErrorToast(getMarketFolderErrorMessage(error))
      return false
    } finally {
      saving.current = false
      setBusy(false)
    }
  }
  return { folders, busy, toggle, create }
}
