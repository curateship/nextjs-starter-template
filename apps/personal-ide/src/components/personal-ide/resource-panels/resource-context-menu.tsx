import {
  Copy,
  ExternalLink,
  Files,
  FileText,
  FolderPlus,
  Pencil,
  Pin,
  PinOff,
  RefreshCw,
  Trash2,
} from "lucide-react"
import type { ReactNode } from "react"

import type { FileEntry } from "@/app/types"
import { cn } from "@/lib/utils"
import type { FileMenuState, FileOperationProps } from "./types"

type EntryAction = {
  icon: ReactNode
  label: string
  onClick: (entry: FileEntry) => void
}

export function ResourceContextMenu({
  basePath,
  entryAction,
  isEntryPinned,
  menu,
  operations,
  onClose,
  onPinEntry,
  onStartCreate,
  onUnpinEntry,
  onRenameEntry,
}: {
  basePath: string
  entryAction?: EntryAction
  isEntryPinned?: (entry: FileEntry) => boolean
  menu: FileMenuState | null
  operations: FileOperationProps
  onClose: () => void
  onPinEntry?: (entry: FileEntry) => void
  onStartCreate: (kind: "file" | "folder", basePath: string) => void
  onUnpinEntry?: (entry: FileEntry) => void
  onRenameEntry: (entry: FileEntry) => void
}) {
  if (!menu) return null

  return (
    <FileContextMenu
      entryAction={entryAction}
      isEntryPinned={isEntryPinned}
      menu={menu}
      onClose={onClose}
      onCopyPath={operations.onCopyPath}
      onCreateFile={() => {
        onStartCreate("file", menu.basePath || basePath)
      }}
      onCreateFolder={() => {
        onStartCreate("folder", menu.basePath || basePath)
      }}
      onDuplicate={operations.onDuplicate}
      onPinEntry={onPinEntry}
      onRefresh={() => {
        operations.onRefresh(menu.entry?.isDir ? menu.entry.path : menu.basePath || basePath)
      }}
      onRename={(entry) => {
        onRenameEntry(entry)
      }}
      onReveal={operations.onReveal}
      onTrash={operations.onTrash}
      onUnpinEntry={onUnpinEntry}
    />
  )
}

export function FileContextMenu({
  entryAction,
  isEntryPinned,
  menu,
  onClose,
  onCopyPath,
  onCreateFile,
  onCreateFolder,
  onDuplicate,
  onPinEntry,
  onRefresh,
  onRename,
  onReveal,
  onTrash,
  onUnpinEntry,
}: {
  entryAction?: EntryAction
  isEntryPinned?: (entry: FileEntry) => boolean
  menu: FileMenuState
  onClose: () => void
  onCopyPath: (entry: FileEntry) => void
  onCreateFile: () => void
  onCreateFolder: () => void
  onDuplicate: (entry: FileEntry) => void
  onPinEntry?: (entry: FileEntry) => void
  onRefresh: () => void
  onRename: (entry: FileEntry) => void
  onReveal: (entry: FileEntry) => void
  onTrash: (entry: FileEntry) => void
  onUnpinEntry?: (entry: FileEntry) => void
}) {
  const entry = menu.entry
  const pinned = entry ? isEntryPinned?.(entry) : false

  function run(action: () => void) {
    action()
    onClose()
  }

  return (
    <div
      className="fixed z-50 w-48 rounded-lg border bg-popover p-1 shadow-md"
      style={{ left: menu.x, top: menu.y }}
      onContextMenu={(event) => event.preventDefault()}
      role="menu"
    >
      <FileMenuButton icon={<FileText />} label="New File" onClick={() => run(onCreateFile)} />
      <FileMenuButton
        icon={<FolderPlus />}
        label="New Folder"
        onClick={() => run(onCreateFolder)}
      />
      <FileMenuButton icon={<RefreshCw />} label="Refresh" onClick={() => run(onRefresh)} />

      {entry ? (
        <>
          <div className="my-1 h-px bg-border" />
          {entryAction ? (
            <FileMenuButton
              icon={entryAction.icon}
              label={entryAction.label}
              onClick={() => run(() => entryAction.onClick(entry))}
            />
          ) : null}
          {onPinEntry && onUnpinEntry ? (
            <FileMenuButton
              icon={pinned ? <PinOff /> : <Pin />}
              label={pinned ? "Unpin from bottom bar" : "Pin to bottom bar"}
              onClick={() => run(() => (pinned ? onUnpinEntry(entry) : onPinEntry(entry)))}
            />
          ) : null}
          <FileMenuButton
            icon={<Pencil />}
            label="Rename"
            onClick={() => run(() => onRename(entry))}
          />
          <FileMenuButton
            icon={<Files />}
            label="Duplicate"
            onClick={() => run(() => onDuplicate(entry))}
          />
          <FileMenuButton
            icon={<Copy />}
            label="Copy Relative Path"
            onClick={() => run(() => onCopyPath(entry))}
          />
          <FileMenuButton
            icon={<ExternalLink />}
            label="Reveal in Finder"
            onClick={() => run(() => onReveal(entry))}
          />
          <FileMenuButton
            danger
            icon={<Trash2 />}
            label="Delete"
            onClick={() => run(() => onTrash(entry))}
          />
        </>
      ) : null}
    </div>
  )
}

function FileMenuButton({
  danger,
  icon,
  label,
  onClick,
}: {
  danger?: boolean
  icon: ReactNode
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      className={cn(
        "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-muted [&_svg]:size-3.5",
        danger && "text-red-600"
      )}
      onClick={onClick}
    >
      {icon}
      <span className="truncate">{label}</span>
    </button>
  )
}
