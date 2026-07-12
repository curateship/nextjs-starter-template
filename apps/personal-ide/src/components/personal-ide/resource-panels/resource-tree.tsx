import {
  DndContext,
  PointerSensor,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import { CSS } from "@dnd-kit/utilities"
import { ChevronDown, ChevronRight, Folder } from "lucide-react"
import {
  useMemo,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react"

import { fileName, isSameOrChildPath, parentPath } from "@/app/path"
import type { FileEntry } from "@/app/types"
import { RenameInput } from "@/components/personal-ide/rename-input"
import { cn } from "@/lib/utils"
import type { FileCreateRequest } from "./types"

type FolderNode = {
  path: string
  name: string
  children: FolderNode[]
}

export function ResourceTree<T>({
  createRequest,
  folders,
  items,
  itemKey,
  itemParent,
  itemPath,
  renamePath,
  renameValue,
  renderCreate,
  renderItem,
  rootPath,
  onFolderContextMenu,
  onMove,
  onRenameCancel,
  onRenameChange,
  onRenameSubmit,
}: {
  createRequest: FileCreateRequest | null
  folders: string[]
  items: T[]
  itemKey: (item: T) => string
  itemParent: (item: T) => string
  itemPath: (item: T) => string
  renamePath: string
  renameValue: string
  renderCreate: () => ReactNode
  renderItem: (item: T) => ReactNode
  rootPath: string
  onFolderContextMenu: (entry: FileEntry, event: ReactMouseEvent) => void
  onMove: (sourcePath: string, targetDir: string) => void
  onRenameCancel: () => void
  onRenameChange: (value: string) => void
  onRenameSubmit: (entry: FileEntry, value: string) => void
}) {
  const openFoldersKey = `personal-ide:open-folders:${rootPath}`
  const [openFolders, setOpenFolders] = useState<Record<string, boolean>>(() =>
    readOpenFolders(openFoldersKey)
  )
  const [activeDragPath, setActiveDragPath] = useState("")
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  )

  function setFolderOpen(path: string, open: boolean) {
    setOpenFolders((current) => {
      if (Boolean(current[path]) === open) return current
      const next = { ...current, [path]: open }
      writeOpenFolders(openFoldersKey, next)
      return next
    })
  }

  const tree = useMemo(() => buildFolderTree(rootPath, folders), [folders, rootPath])
  const itemsByFolder = useMemo(
    () => groupItemsByFolder(rootPath, folders, items, itemParent),
    [folders, itemParent, items, rootPath]
  )

  function handleDragEnd({ active, over }: DragEndEvent) {
    setActiveDragPath("")
    if (!over) return

    const source = String(active.id)
    const target = String(over.id)
    if (!canDrop(source, target)) return
    onMove(source, target)
  }

  function renderItemRows(folderPath: string, level: number) {
    return (itemsByFolder.get(folderPath) ?? []).map((item) => {
      const path = itemPath(item)

      return (
        <DraggableRow
          key={itemKey(item)}
          id={path}
          disabled={renamePath === path}
          style={level ? { paddingLeft: level * 16 } : undefined}
        >
          {renderItem(item)}
        </DraggableRow>
      )
    })
  }

  function renderFolder(node: FolderNode, level: number) {
    // Force-open while a create targets this folder or one of its children,
    // so the inline input is visible even in a collapsed folder.
    const open =
      Boolean(openFolders[node.path]) ||
      (createRequest !== null && isSameOrChildPath(createRequest.basePath, node.path))
    const renaming = renamePath === node.path
    const entry: FileEntry = { name: node.name, path: node.path, isDir: true }

    return (
      <div key={node.path}>
        <FolderRow
          activeDragPath={activeDragPath}
          path={node.path}
          renaming={renaming}
          style={{ paddingLeft: 8 + level * 16 }}
          onClick={() => {
            if (renaming) return
            setFolderOpen(node.path, !open)
          }}
          onContextMenu={(event) => onFolderContextMenu(entry, event)}
        >
          {open ? (
            <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
          )}
          <Folder className="size-4 shrink-0 text-neutral-600" />
          {renaming ? (
            <RenameInput
              value={renameValue}
              onCancel={onRenameCancel}
              onChange={onRenameChange}
              onSubmit={(value) => onRenameSubmit(entry, value)}
            />
          ) : (
            <span className="min-w-0 flex-1 truncate">{node.name}</span>
          )}
        </FolderRow>

        {open ? (
          <div className="mt-1 space-y-1">
            {createRequest?.basePath === node.path ? (
              <div style={{ paddingLeft: 8 + (level + 1) * 16 }}>{renderCreate()}</div>
            ) : null}
            {node.children.map((child) => renderFolder(child, level + 1))}
            {renderItemRows(node.path, level + 1)}
          </div>
        ) : null}
      </div>
    )
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={(event) => setActiveDragPath(String(event.active.id))}
      onDragCancel={() => setActiveDragPath("")}
      onDragEnd={handleDragEnd}
    >
      <RootDropZone activeDragPath={activeDragPath} rootPath={rootPath}>
        {createRequest?.basePath === rootPath ? renderCreate() : null}
        {tree.map((node) => renderFolder(node, 0))}
        {renderItemRows(rootPath, 0)}
        {/* Catch-all zone so items inside folders can be dropped back at the root. */}
        <div className="min-h-16 flex-1" />
      </RootDropZone>
    </DndContext>
  )
}

function RootDropZone({
  activeDragPath,
  children,
  rootPath,
}: {
  activeDragPath: string
  children: ReactNode
  rootPath: string
}) {
  const { isOver, setNodeRef } = useDroppable({ id: rootPath })

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex min-h-full flex-col gap-1 rounded-md pr-1",
        isOver && canDrop(activeDragPath, rootPath) && "bg-accent/40"
      )}
    >
      {children}
    </div>
  )
}

function FolderRow({
  activeDragPath,
  children,
  path,
  renaming,
  style,
  onClick,
  onContextMenu,
}: {
  activeDragPath: string
  children: ReactNode
  path: string
  renaming: boolean
  style: CSSProperties
  onClick: () => void
  onContextMenu: (event: ReactMouseEvent) => void
}) {
  const drag = useDraggable({ id: path, disabled: renaming })
  const drop = useDroppable({ id: path })

  return (
    <div
      ref={(node) => {
        drag.setNodeRef(node)
        drop.setNodeRef(node)
      }}
      {...drag.listeners}
      className={cn(
        "flex h-7 w-full min-w-0 items-center gap-1.5 rounded-md px-2 text-left text-sm hover:bg-background",
        drop.isOver && canDrop(activeDragPath, path) && "bg-accent ring-1 ring-ring ring-inset",
        drag.isDragging && "relative z-40 opacity-80"
      )}
      style={{ ...style, transform: CSS.Translate.toString(drag.transform) }}
      onClick={onClick}
      onContextMenu={onContextMenu}
    >
      {children}
    </div>
  )
}

function DraggableRow({
  children,
  disabled,
  id,
  style,
}: {
  children: ReactNode
  disabled: boolean
  id: string
  style?: CSSProperties
}) {
  const { isDragging, listeners, setNodeRef, transform } = useDraggable({ id, disabled })

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      className={cn(isDragging && "relative z-40 opacity-80")}
      style={{ ...style, transform: CSS.Translate.toString(transform) }}
    >
      {children}
    </div>
  )
}

function readOpenFolders(key: string): Record<string, boolean> {
  try {
    const stored = JSON.parse(localStorage.getItem(key) ?? "{}")
    return stored && typeof stored === "object" ? stored : {}
  } catch {
    return {}
  }
}

function writeOpenFolders(key: string, openFolders: Record<string, boolean>) {
  try {
    localStorage.setItem(key, JSON.stringify(openFolders))
  } catch {
    // Persisting open state is best-effort.
  }
}

function canDrop(sourcePath: string, targetDir: string) {
  if (!sourcePath) return false
  if (isSameOrChildPath(targetDir, sourcePath)) return false
  if (parentPath(sourcePath) === targetDir) return false
  return true
}

function buildFolderTree(rootPath: string, folderPaths: string[]) {
  const nodes = new Map<string, FolderNode>()
  const roots: FolderNode[] = []

  for (const path of [...folderPaths].sort()) {
    if (nodes.has(path) || !isSameOrChildPath(path, rootPath) || path === rootPath) continue

    const node: FolderNode = { path, name: fileName(path), children: [] }
    nodes.set(path, node)
    const parent = nodes.get(parentPath(path))
    if (parent) {
      parent.children.push(node)
    } else {
      roots.push(node)
    }
  }

  return roots
}

function groupItemsByFolder<T>(
  rootPath: string,
  folderPaths: string[],
  items: T[],
  itemParent: (item: T) => string
) {
  const known = new Set(folderPaths)
  const grouped = new Map<string, T[]>()

  for (const item of items) {
    let parent = itemParent(item)
    while (parent !== rootPath && !known.has(parent)) {
      const next = parentPath(parent)
      if (!next || next === parent) {
        parent = rootPath
        break
      }
      parent = next
    }

    const list = grouped.get(parent) ?? []
    list.push(item)
    grouped.set(parent, list)
  }

  return grouped
}
