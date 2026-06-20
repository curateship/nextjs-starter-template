import { ChevronDown, GitCommitHorizontal, GitMerge, RefreshCw, Sparkles, Trash2 } from "lucide-react"
import { useState } from "react"

import type { GitFile, GitStatus } from "@/app/types"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useDismissibleMenu } from "@/hooks/use-dismissible-menu"
import { cn } from "@/lib/utils"

export function ChangesPanel({
  activePath,
  busyAction,
  commitMessage,
  error,
  gitStatus,
  onCommit,
  onCommitMessageChange,
  onDiscardAll,
  onDiscardFile,
  onMerge,
  onOpenFile,
  onOpenMergeFile,
  onRefresh,
  onSync,
  onUpdateFromDevelop,
}: {
  activePath: string
  busyAction: string
  commitMessage: string
  error: string
  gitStatus: GitStatus
  onCommit: () => void
  onCommitMessageChange: (value: string) => void
  onDiscardAll: () => void
  onDiscardFile: (file: GitFile) => void
  onMerge: () => void
  onOpenFile: (file: GitFile) => void
  onOpenMergeFile: (file: GitFile) => void
  onRefresh: () => void
  onSync: () => void
  onUpdateFromDevelop: () => void
}) {
  const [discardMenu, setDiscardMenu] = useState<{
    file?: GitFile
    x: number
    y: number
  } | null>(null)

  useDismissibleMenu(discardMenu, setDiscardMenu)
  const developCommits = gitStatus.developCommits
  const developFiles = developCommits.length ? gitStatus.developFiles : []
  const developUpdateCount = developCommits.length
  const isActiveFile = (file: GitFile) => Boolean(file.appPath && file.appPath === activePath)

  return (
    <div
      className="flex h-full min-h-0 flex-col p-3"
      onContextMenu={(event) => {
        event.preventDefault()
        setDiscardMenu({ x: event.clientX, y: event.clientY })
      }}
    >
      <div className="mb-3 grid grid-cols-[1fr_auto] items-start">
        <div className="min-w-0">
          <div className="text-sm font-semibold">Changes</div>
          <p className="truncate text-xs text-muted-foreground">
            {gitStatus.branch || "No workspace"}
          </p>
        </div>
        <Button variant="ghost" size="icon-sm" onClick={onRefresh} aria-label="Refresh changes">
          <RefreshCw />
        </Button>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-3 pr-1">
          {developCommits.length ? (
            <div className="space-y-2 border-b pb-3">
              <div>
                <div className="text-xs font-semibold">Develop updates</div>
                <div className="text-xs text-muted-foreground">
                  {developCommits.length} commits not in workspace
                </div>
              </div>
              <div className="space-y-1">
                {developCommits.map((commit) => (
                  <div key={commit.hash} className="flex gap-2 text-xs">
                    <span className="shrink-0 font-mono text-muted-foreground">
                      {commit.hash}
                    </span>
                    <span className="min-w-0 truncate">{commit.subject}</span>
                  </div>
                ))}
              </div>
              {developFiles.length ? (
                <div className="space-y-1">
                  <div className="text-xs font-semibold">Files changed</div>
                  {developFiles.map((file) => (
                    <div
                      key={`${file.status}-${file.path}`}
                      className="flex gap-2 px-2 py-1 text-xs"
                    >
                      <span className="w-8 shrink-0 font-mono text-muted-foreground">
                        {file.status || "M"}
                      </span>
                      <span className="min-w-0 truncate">{file.path}</span>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          {gitStatus.mergeCommits.length ? (
            <div className="space-y-2 border-b pb-3">
              <div>
                <div className="text-xs font-semibold">Pending merge</div>
                <div className="text-xs text-muted-foreground">
                  {gitStatus.mergeCommits.length} commits ahead of develop
                </div>
              </div>
              <div className="space-y-1">
                {gitStatus.mergeCommits.map((commit) => (
                  <div key={commit.hash} className="flex gap-2 text-xs">
                    <span className="shrink-0 font-mono text-muted-foreground">
                      {commit.hash}
                    </span>
                    <span className="min-w-0 truncate">{commit.subject}</span>
                  </div>
                ))}
              </div>
              {gitStatus.mergeFiles.length ? (
                <div className="space-y-1">
                  <div className="text-xs font-semibold">Files changed</div>
                  {gitStatus.mergeFiles.map((file) => (
                    <button
                      key={`${file.status}-${file.path}`}
                      type="button"
                      className={cn(
                        "flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-xs hover:bg-muted",
                        isActiveFile(file) && "bg-muted text-foreground",
                        !file.appPath && "text-muted-foreground"
                      )}
                      aria-current={isActiveFile(file) ? "true" : undefined}
                      onClick={() => onOpenMergeFile(file)}
                      title={file.appPath ? "Open merge diff" : "Outside selected app folder"}
                    >
                      <span className="w-8 shrink-0 font-mono text-muted-foreground">
                        {file.status || "M"}
                      </span>
                      <span className="min-w-0 truncate">{file.path}</span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="space-y-1">
            {gitStatus.files.length ? (
              gitStatus.files.map((file) => (
                <button
                  key={`${file.status}-${file.path}`}
                  type="button"
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-xs hover:bg-muted",
                    isActiveFile(file) && "bg-muted text-foreground",
                    !file.appPath && "text-muted-foreground"
                  )}
                  aria-current={isActiveFile(file) ? "true" : undefined}
                  onClick={() => onOpenFile(file)}
                  onContextMenu={(event) => {
                    event.preventDefault()
                    event.stopPropagation()
                    setDiscardMenu({ file, x: event.clientX, y: event.clientY })
                  }}
                  title={file.appPath ? "Open changed file" : "Outside selected app folder"}
                >
                  <span className="w-8 shrink-0 font-mono text-muted-foreground">
                    {file.status || "M"}
                  </span>
                  <span className="min-w-0 truncate">{file.path}</span>
                </button>
              ))
            ) : (
              <div className="px-2 py-2 text-sm text-muted-foreground">
                No changes.
              </div>
            )}
          </div>
        </div>
      </ScrollArea>

      {error ? (
        <div className="mt-2 rounded-md border border-amber-300 bg-amber-50 px-2 py-1.5 text-xs text-amber-800">
          {error}
        </div>
      ) : null}

      <div className="mt-3 space-y-2">
        <div className="relative">
          <Input
            value={commitMessage}
            onChange={(event) => onCommitMessageChange(event.target.value)}
            placeholder="Commit message"
            className="bg-background pr-9"
          />
          <Sparkles className="absolute top-2 right-2 size-4 text-muted-foreground" />
        </div>
        <div className="grid grid-cols-3 gap-2">
          <Button
            variant="outline"
            className="bg-background"
            disabled={busyAction === "commit" || !commitMessage.trim()}
            onClick={onCommit}
          >
            <GitCommitHorizontal />
            Commit
          </Button>
          <Button
            variant="outline"
            className="bg-background"
            disabled={busyAction === "sync" || !gitStatus.unpushedCommitCount}
            onClick={onSync}
          >
            <RefreshCw />
            {busyAction === "sync"
              ? "Syncing..."
              : countLabel("Sync", gitStatus.unpushedCommitCount)}
          </Button>
          <Button
            variant="outline"
            className="bg-background"
            disabled={busyAction === "merge" || !gitStatus.unmergedCommitCount}
            onClick={onMerge}
          >
            <GitMerge />
            {busyAction === "merge"
              ? "Merging..."
              : countLabel("Merge", gitStatus.unmergedCommitCount)}
          </Button>
        </div>
        <Button
          variant="outline"
          className="w-full bg-background"
          disabled={busyAction === "update" || !developUpdateCount}
          onClick={onUpdateFromDevelop}
        >
          <ChevronDown />
          {busyAction === "update"
            ? "Updating..."
            : countLabel("Update from develop", developUpdateCount)}
        </Button>
      </div>

      {discardMenu ? (
        <div
          className="fixed z-50 w-44 rounded-lg border bg-popover p-1 shadow-md"
          style={{ left: discardMenu.x, top: discardMenu.y }}
          role="menu"
        >
          {discardMenu.file ? (
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-red-600 hover:bg-muted disabled:pointer-events-none disabled:opacity-50"
              disabled={busyAction === "discard"}
              onClick={() => {
                const { file } = discardMenu
                if (!file) return
                setDiscardMenu(null)
                onDiscardFile(file)
              }}
            >
              <Trash2 className="size-4" />
              Discard File
            </button>
          ) : null}
          <button
            type="button"
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-red-600 hover:bg-muted disabled:pointer-events-none disabled:opacity-50"
            disabled={busyAction === "discard" || !gitStatus.files.length}
            onClick={() => {
              setDiscardMenu(null)
              onDiscardAll()
            }}
          >
            <Trash2 className="size-4" />
            Discard All
          </button>
        </div>
      ) : null}
    </div>
  )
}

function countLabel(label: string, count: number) {
  return count > 0 ? `${label} (${count})` : label
}
