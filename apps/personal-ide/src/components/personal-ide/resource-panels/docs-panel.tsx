import { FileText } from "lucide-react"
import { useState } from "react"

import { DOCS_PATH } from "@/app/constants"
import { joinRelativePath, parentPath } from "@/app/path"
import {
  docFileEntry,
  resourceNameFromPath,
} from "@/app/resources"
import type { DocItem, FileEntry } from "@/app/types"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { InlineCreate } from "@/components/personal-ide/inline-create"
import { PanelError } from "@/components/personal-ide/panel-error"
import { RenameInput } from "@/components/personal-ide/rename-input"
import { useDismissibleMenu } from "@/hooks/use-dismissible-menu"
import { ResourceContextMenu } from "./resource-context-menu"
import { ResourceTree } from "./resource-tree"
import type { FileCreateRequest, FileMenuState } from "./types"

export function DocsPanel({
  error,
  docs,
  folders,
  onCreate,
  onCreateFolder,
  onCopyPath,
  onDuplicate,
  onMove,
  onOpenDoc,
  onRefresh,
  onRename,
  onReveal,
  onTrash,
}: {
  error: string
  docs: DocItem[]
  folders: string[]
  onCreate: (value: string, folder?: string) => void
  onCreateFolder: (value: string) => void
  onCopyPath: (entry: FileEntry) => void
  onDuplicate: (entry: FileEntry) => void
  onMove: (sourcePath: string, targetDir: string) => void
  onOpenDoc: (doc: DocItem) => void
  onRefresh: (path?: string) => void
  onRename: (entry: FileEntry, newName: string) => void
  onReveal: (entry: FileEntry) => void
  onTrash: (entry: FileEntry) => void
}) {
  const [menu, setMenu] = useState<FileMenuState | null>(null)
  const [createRequest, setCreateRequest] = useState<FileCreateRequest | null>(null)
  const [renamePath, setRenamePath] = useState("")
  const [renameValue, setRenameValue] = useState("")
  const operations = {
    onCopyPath,
    onDuplicate,
    onRefresh,
    onRename,
    onReveal,
    onTrash,
  }

  useDismissibleMenu(menu, setMenu)

  function cancelRename() {
    setRenamePath("")
    setRenameValue("")
  }

  function createInRequest(value: string) {
    if (!createRequest) return

    if (createRequest.kind === "file") {
      onCreate(
        resourceNameFromPath(value),
        createRequest.basePath === DOCS_PATH ? undefined : createRequest.basePath
      )
    } else {
      onCreateFolder(joinRelativePath(createRequest.basePath, value))
    }
    setCreateRequest(null)
  }

  function renderDoc(doc: DocItem) {
    const entry = docFileEntry(doc)
    const renaming = renamePath === entry.path

    return (
      <div
        className="rounded-md"
        onContextMenu={(event) => {
          event.preventDefault()
          event.stopPropagation()
          setMenu({
            x: event.clientX,
            y: event.clientY,
            entry,
            basePath: parentPath(entry.path),
          })
        }}
      >
        {renaming ? (
          <RenameInput
            value={renameValue}
            onCancel={cancelRename}
            onChange={setRenameValue}
            onSubmit={(value) => {
              cancelRename()
              onRename(entry, value)
            }}
          />
        ) : (
          <Button
            variant="outline"
            className="w-full justify-start bg-background"
            onClick={() => onOpenDoc(doc)}
          >
            <FileText />
            {doc.name}
          </Button>
        )}
      </div>
    )
  }

  return (
    <div
      className="flex h-full min-h-0 flex-col px-3 pb-3"
      onDoubleClick={(event) => {
        if (event.target instanceof Element && event.target.closest("input, textarea, form")) return
        setCreateRequest({ kind: "file", basePath: DOCS_PATH, nonce: Date.now() })
      }}
    >
      <div className="mb-3">
        <h2 className="text-sm font-semibold">Docs</h2>
        <p className="text-xs text-muted-foreground">{DOCS_PATH}</p>
      </div>
      <PanelError error={error} />
      <ScrollArea
        className="min-h-0 flex-1"
        onContextMenu={(event) => {
          event.preventDefault()
          setMenu({ x: event.clientX, y: event.clientY, basePath: DOCS_PATH })
        }}
      >
        {docs.length || folders.length || createRequest ? (
          <ResourceTree
            createRequest={createRequest}
            folders={folders}
            items={docs}
            itemKey={(doc) => doc.path}
            itemParent={(doc) => parentPath(doc.path)}
            itemPath={(doc) => doc.path}
            renamePath={renamePath}
            renameValue={renameValue}
            renderCreate={() =>
              createRequest ? (
                <InlineCreate
                  key={createRequest.nonce}
                  buttonLabel={createRequest.kind === "file" ? "Create file" : "Create folder"}
                  placeholder={createRequest.kind === "file" ? "file.md" : "folder"}
                  onCancel={() => setCreateRequest(null)}
                  onCreate={createInRequest}
                />
              ) : null
            }
            renderItem={renderDoc}
            rootPath={DOCS_PATH}
            onFolderContextMenu={(entry, event) => {
              event.preventDefault()
              event.stopPropagation()
              setMenu({ x: event.clientX, y: event.clientY, entry, basePath: entry.path })
            }}
            onMove={onMove}
            onRenameCancel={cancelRename}
            onRenameChange={setRenameValue}
            onRenameSubmit={(entry, value) => {
              cancelRename()
              onRename(entry, value)
            }}
          />
        ) : (
          <div className="px-2 py-2 text-sm text-muted-foreground">
            No docs yet.
          </div>
        )}
      </ScrollArea>
      <ResourceContextMenu
        basePath={DOCS_PATH}
        menu={menu}
        operations={operations}
        onClose={() => setMenu(null)}
        onStartCreate={(kind, basePath) => {
          setCreateRequest({ kind, basePath, nonce: Date.now() })
        }}
        onRenameEntry={(entry) => {
          setRenamePath(entry.path)
          setRenameValue(entry.name)
        }}
      />
    </div>
  )
}
