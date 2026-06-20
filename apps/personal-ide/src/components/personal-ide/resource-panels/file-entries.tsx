import {
  ChevronDown,
  ChevronRight,
  FileText,
  Folder,
} from "lucide-react"
import type { MouseEvent as ReactMouseEvent } from "react"

import type { DirectoryState, FileEntry } from "@/app/types"
import { Input } from "@/components/ui/input"
import { InlineCreate } from "@/components/personal-ide/inline-create"
import type { FileCreateRequest } from "./types"

export function FileEntries({
  basePath,
  createRequest,
  directories,
  entries,
  level,
  renamePath,
  renameValue,
  onCreate,
  onCreateCancel,
  onContextMenu,
  onOpenFile,
  onRename,
  onRenameCancel,
  onRenameValueChange,
  onToggleDirectory,
}: {
  basePath: string
  createRequest: FileCreateRequest | null
  directories: Record<string, DirectoryState>
  entries: FileEntry[]
  level: number
  renamePath: string
  renameValue: string
  onCreate: (value: string) => void
  onCreateCancel: () => void
  onContextMenu: (entry: FileEntry, event: ReactMouseEvent) => void
  onOpenFile: (entry: FileEntry) => void
  onRename: (entry: FileEntry, value: string) => void
  onRenameCancel: () => void
  onRenameValueChange: (value: string) => void
  onToggleDirectory: (path: string) => void
}) {
  return (
    <div className="space-y-0.5">
      {createRequest?.basePath === basePath ? (
        <div style={{ paddingLeft: 8 + level * 16 }}>
          <InlineCreate
            key={createRequest.nonce}
            buttonLabel={createRequest.kind === "file" ? "Create file" : "Create folder"}
            placeholder={createRequest.kind === "file" ? "file.md" : "folder"}
            onCancel={onCreateCancel}
            onCreate={onCreate}
          />
        </div>
      ) : null}
      {entries.map((entry) => {
        const directory = directories[entry.path]
        const open = Boolean(directory?.open)
        const renaming = renamePath === entry.path

        return (
          <div key={entry.path}>
            <div
              className="flex h-7 w-full min-w-0 items-center gap-1.5 rounded-md px-2 text-left text-sm hover:bg-background"
              style={{ paddingLeft: 8 + level * 16 }}
              onClick={(event) => {
                if (renaming || event.detail > 1) return
                if (entry.isDir) {
                  onToggleDirectory(entry.path)
                } else {
                  onOpenFile(entry)
                }
              }}
              onContextMenu={(event) => onContextMenu(entry, event)}
            >
              {entry.isDir ? (
                open ? (
                  <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
                ) : (
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                )
              ) : (
                <span className="w-4 shrink-0" />
              )}
              {entry.isDir ? (
                <Folder className="size-4 shrink-0 text-neutral-600" />
              ) : (
                <FileText className="size-4 shrink-0 text-neutral-500" />
              )}
              {renaming ? (
                <form
                  className="min-w-0 flex-1"
                  onSubmit={(event) => {
                    event.preventDefault()
                    const value = renameValue.trim()
                    if (!value || value === entry.name) {
                      onRenameCancel()
                      return
                    }
                    onRename(entry, value)
                  }}
                >
                  <Input
                    autoFocus
                    value={renameValue}
                    className="h-6 bg-background px-1 text-sm"
                    onBlur={onRenameCancel}
                    onChange={(event) => onRenameValueChange(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Escape") {
                        event.preventDefault()
                        onRenameCancel()
                      }
                    }}
                  />
                </form>
              ) : (
                <span className="min-w-0 flex-1 truncate">
                  {entry.name}
                </span>
              )}
            </div>

            {entry.isDir && open ? (
              directory?.loading ? (
                <div
                  className="h-7 px-2 text-sm text-muted-foreground"
                  style={{ paddingLeft: 28 + (level + 1) * 16 }}
                >
                  Loading...
                </div>
              ) : directory?.error ? (
                <div
                  className="h-7 px-2 text-sm text-amber-700"
                  style={{ paddingLeft: 28 + (level + 1) * 16 }}
                >
                  {directory.error}
                </div>
              ) : (
                <FileEntries
                  basePath={entry.path}
                  createRequest={createRequest}
                  directories={directories}
                  entries={directory?.entries ?? []}
                  level={level + 1}
                  renamePath={renamePath}
                  renameValue={renameValue}
                  onCreate={onCreate}
                  onCreateCancel={onCreateCancel}
                  onContextMenu={onContextMenu}
                  onOpenFile={onOpenFile}
                  onRename={onRename}
                  onRenameCancel={onRenameCancel}
                  onRenameValueChange={onRenameValueChange}
                  onToggleDirectory={onToggleDirectory}
                />
              )
            ) : null}
          </div>
        )
      })}
    </div>
  )
}
