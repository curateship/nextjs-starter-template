import { FileText } from "lucide-react"
import { useState } from "react"

import { joinRelativePath, parentPath } from "@/app/path"
import {
  docFileEntry,
  ensureMarkdownPath,
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
import type { FileCreateRequest, FileMenuState } from "./types"

const DOCS_PATH = "workspace/docs"

export function DocsPanel({
  error,
  docs,
  onCreate,
  onCreateFolder,
  onCopyPath,
  onDuplicate,
  onOpenDoc,
  onRefresh,
  onRename,
  onReveal,
  onTrash,
}: {
  error: string
  docs: DocItem[]
  onCreate: (value: string) => void
  onCreateFolder: (value: string) => void
  onCopyPath: (entry: FileEntry) => void
  onDuplicate: (entry: FileEntry) => void
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

  function createInRequest(value: string) {
    if (!createRequest) return

    const path = joinRelativePath(
      createRequest.basePath,
      createRequest.kind === "file" ? ensureMarkdownPath(value) : value
    )
    if (createRequest.kind === "file") {
      onCreate(resourceNameFromPath(path))
    } else {
      onCreateFolder(path)
    }
    setCreateRequest(null)
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
        <div className="space-y-1.5 pr-1">
          {createRequest ? (
            <InlineCreate
              key={createRequest.nonce}
              buttonLabel={createRequest.kind === "file" ? "Create file" : "Create folder"}
              placeholder={createRequest.kind === "file" ? "file.md" : "folder"}
              onCancel={() => setCreateRequest(null)}
              onCreate={createInRequest}
            />
          ) : null}
          {docs.length ? (
            docs.map((doc) => {
              const entry = docFileEntry(doc)
              const renaming = renamePath === entry.path

              return (
                <div
                  key={doc.path}
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
                      onCancel={() => {
                        setRenamePath("")
                        setRenameValue("")
                      }}
                      onChange={setRenameValue}
                      onSubmit={(value) => {
                        setRenamePath("")
                        setRenameValue("")
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
            })
          ) : (
            <div className="px-2 py-2 text-sm text-muted-foreground">
              No docs yet.
            </div>
          )}
        </div>
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
