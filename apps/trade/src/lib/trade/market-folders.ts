export type MarketFolder = {
  id: string
  name: string
  isFav: boolean
  position: number
  marketKeys: string[]
}

export type MarketFolderActions = {
  busy: boolean
  quickAdd: (marketKey: string) => void
  toggle: (marketKey: string, folderId: string, saved: boolean) => Promise<void>
  create: (marketKey: string, name: string) => Promise<boolean>
}

export function favFolder(folders: readonly MarketFolder[]) {
  return folders.find((folder) => folder.isFav) ?? null
}
