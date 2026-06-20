import { FolderOpen, RefreshCw } from "lucide-react"
import { useState } from "react"

import { joinRelativePath, parentPath } from "@/app/path"
import type { DirectoryState, FileEntry, WorkspaceInfo } from "@/app/types"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useDismissibleMenu } from "@/hooks/use-dismissible-menu"
import { FileEntries } from "./file-entries"
import { FileContextMenu } from "./resource-context-menu"
import type { FileCreateRequest, FileMenuState } from "./types"

export function FilesPanel({
  directories,
  error,
  workspace,
  onCreateFile,
  onCreateFolder,
  onCopyPath,
  onDuplicate,
  onOpenFile,
  onOpenWorkspace,
  onRefresh,
  onRename,
  onReveal,
  onTrash,
  onToggleDirectory,
}: {
  directories: Record<string, DirectoryState>
  error: string
  workspace?: WorkspaceInfo
  onCreateFile: (value: string) => void
  onCreateFolder: (value: string) => void
  onCopyPath: (entry: FileEntry) => void
  onDuplicate: (entry: FileEntry) => void
  onOpenFile: (entry: FileEntry) => void
  onOpenWorkspace: () => void
  onRefresh: (path?: string) => void
  onRename: (entry: FileEntry, newName: string) => void
  onReveal: (entry: FileEntry) => void
  onTrash: (entry: FileEntry) => void
  onToggleDirectory: (path: string) => void
}) {
  const root = directories[""]
  const [createRequest, setCreateRequest] = useState<FileCreateRequest | null>(null)
  const [menu, setMenu] = useState<FileMenuState | null>(null)
  const [renamePath, setRenamePath] = useState("")
  const [renameValue, setRenameValue] = useState("")

  useDismissibleMenu(menu, setMenu)

  function startCreate(kind: "file" | "folder", basePath: string) {
    if (basePath) void onRefresh(basePath)
    setCreateRequest({ kind, basePath, nonce: Date.now() })
    setMenu(null)
  }

  function startRename(entry: FileEntry) {
    setRenamePath(entry.path)
    setRenameValue(entry.name)
    setMenu(null)
  }

  function createInRequest(value: string) {
    if (!createRequest) return

    const path = joinRelativePath(createRequest.basePath, value)
    if (createRequest.kind === "file") {
      onCreateFile(path)
    } else {
      onCreateFolder(path)
    }
    setCreateRequest(null)
  }

  return (
    <div
      className="flex h-full min-h-0 flex-col"
      onDoubleClick={(event) => {
        if (!workspace) return
        if (event.target instanceof Element && event.target.closest("input, textarea, form")) return
        setCreateRequest({ kind: "file", basePath: "", nonce: Date.now() })
      }}
    >
      <div className="flex items-center justify-between gap-2 px-3 pb-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">Files</h2>
          {workspace ? (
            <p className="truncate text-xs text-muted-foreground">{workspace.appName}</p>
          ) : (
            <p className="text-xs text-muted-foreground">No workspace</p>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => onRefresh("")}
            disabled={!workspace}
            aria-label="Refresh files"
          >
            <RefreshCw />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onOpenWorkspace}
            aria-label="Add workspace"
          >
            <FolderOpen />
          </Button>
        </div>
      </div>

      {error ? (
        <div className="mx-3 mb-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {error}
        </div>
      ) : null}

      <ScrollArea
        className="min-h-0 flex-1 px-2 pb-3"
        onContextMenu={(event) => {
          if (!workspace) return
          event.preventDefault()
          setMenu({ x: event.clientX, y: event.clientY, basePath: "" })
        }}
      >
        {!workspace ? (
          <div className="rounded-lg border bg-background p-3">
            <div className="mb-3">
              <div className="text-sm font-medium">No workspace open</div>
              <p className="text-xs text-muted-foreground">
                Add a workspace to browse an isolated app copy.
              </p>
            </div>
            <Button variant="outline" className="w-full justify-start" onClick={onOpenWorkspace}>
              <FolderOpen />
              Add workspace
            </Button>
          </div>
        ) : root?.loading ? (
          <div className="px-2 py-2 text-sm text-muted-foreground">Loading...</div>
        ) : root?.error ? (
          <div className="px-2 py-2 text-sm text-amber-700">{root.error}</div>
        ) : (
          <FileEntries
            basePath=""
            createRequest={createRequest}
            directories={directories}
            entries={root?.entries ?? []}
            level={0}
            renamePath={renamePath}
            renameValue={renameValue}
            onCreate={createInRequest}
            onCreateCancel={() => setCreateRequest(null)}
            onContextMenu={(entry, event) => {
              event.preventDefault()
              event.stopPropagation()
              setMenu({
                x: event.clientX,
                y: event.clientY,
                entry,
                basePath: entry.isDir ? entry.path : parentPath(entry.path),
              })
            }}
            onOpenFile={onOpenFile}
            onRename={(entry, newName) => {
              setRenamePath("")
              setRenameValue("")
              onRename(entry, newName)
            }}
            onRenameCancel={() => {
              setRenamePath("")
              setRenameValue("")
            }}
            onRenameValueChange={setRenameValue}
            onToggleDirectory={onToggleDirectory}
          />
        )}
      </ScrollArea>
      {menu ? (
        <FileContextMenu
          menu={menu}
          onClose={() => setMenu(null)}
          onCopyPath={onCopyPath}
          onCreateFile={() => startCreate("file", menu.basePath)}
          onCreateFolder={() => startCreate("folder", menu.basePath)}
          onDuplicate={onDuplicate}
          onRefresh={() => {
            setMenu(null)
            onRefresh(menu.entry?.isDir ? menu.entry.path : menu.basePath)
          }}
          onRename={startRename}
          onReveal={onReveal}
          onTrash={onTrash}
        />
      ) : null}
    </div>
  )
}
