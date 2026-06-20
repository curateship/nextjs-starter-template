import type { FileEntry } from "@/app/types"

export type FileCreateRequest = {
  basePath: string
  kind: "file" | "folder"
  nonce: number
}

export type FileMenuState = {
  basePath: string
  entry?: FileEntry
  x: number
  y: number
}

export type FileOperationProps = {
  onCopyPath: (entry: FileEntry) => void
  onDuplicate: (entry: FileEntry) => void
  onRefresh: (path?: string) => void
  onRename: (entry: FileEntry, newName: string) => void
  onReveal: (entry: FileEntry) => void
  onTrash: (entry: FileEntry) => void
}
