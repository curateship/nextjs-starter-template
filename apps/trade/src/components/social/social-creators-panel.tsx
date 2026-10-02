import * as React from "react"
import {
  ChevronRightIcon,
  FolderIcon,
  FolderPlusIcon,
  PlusIcon,
  SettingsIcon,
  UsersIcon,
} from "lucide-react"

import { DashboardCardTitleHeader } from "@/components/shared/dashboard-card-header"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { focusRing } from "@/lib/layout/focus-ring"
import type {
  SocialFeedCreator,
  SocialFeedScope,
  SocialFolder,
} from "@/lib/trade/social/feed"
import { cn } from "@/lib/utils"

/**
 * The feed's left panel: your creators, in folders.
 *
 * The rows are the markets folder menu's shape in a docked panel: an Everyone
 * row on top that is not a folder and cannot be renamed, hidden or deleted,
 * then the folders in their saved order, then the creators in no folder.
 * A folder's creators open under it, one folder at a time.
 *
 * **Clicking a row narrows the feed in place**, no navigation. Clicking the
 * row already picked widens it back to Everyone. The way to one creator's own
 * dashboard is the handle on their posts in the feed, because this panel's
 * job is to filter, not to leave the page.
 *
 * Creators go into folders through the folder button on their row, the same
 * move as the markets panel's star. The cog opens the manage window for
 * renaming, reordering, hiding and deleting folders.
 */
export type FolderActions = {
  busy: boolean
  /** Put one creator in or out of one folder. Applied optimistically. */
  toggle: (folderId: string, creatorId: string, saved: boolean) => void
  /** Make a folder, optionally with a first creator in it. */
  create: (name: string, creatorId?: string) => Promise<boolean>
}

export function SocialCreatorsPanel({
  folders,
  creators,
  scope,
  onPickFolder,
  onPickCreator,
  actions,
  onAddCreator,
  onManage,
}: {
  folders: readonly SocialFolder[]
  creators: readonly SocialFeedCreator[]
  scope: SocialFeedScope
  /** Null widens back to Everyone. */
  onPickFolder: (folderId: string | null) => void
  onPickCreator: (creatorId: string | null) => void
  actions: FolderActions
  onAddCreator: () => void
  onManage: () => void
}) {
  const [expandedId, setExpandedId] = React.useState<string | null>(null)
  const [creating, setCreating] = React.useState(false)
  const [newName, setNewName] = React.useState("")

  const byId = React.useMemo(
    () => new Map(creators.map((creator) => [creator.id, creator])),
    [creators]
  )
  const shownFolders = React.useMemo(
    () =>
      folders
        .filter((folder) => !folder.hidden)
        .sort((left, right) => left.position - right.position),
    [folders]
  )
  // In no folder at all, hidden ones included: hiding a folder keeps its
  // creators, and a kept creator must not reappear down here as if loose.
  const ungrouped = React.useMemo(() => {
    const foldered = new Set(
      folders.flatMap((folder) => folder.creatorIds)
    )
    return creators.filter((creator) => !foldered.has(creator.id))
  }, [creators, folders])

  async function submitNewFolder(event: React.FormEvent) {
    event.preventDefault()
    if (actions.busy || !newName.trim()) return
    const created = await actions.create(newName)
    if (!created) return
    setNewName("")
    setCreating(false)
  }

  const everyonePicked = scope.folderId === null && scope.creatorId === null

  return (
    <>
      <DashboardCardTitleHeader
        icon={<UsersIcon />}
        title="Creators"
        action={
          <div className="flex items-center gap-1">
            <PanelHeaderButton
              label="Add a creator"
              onClick={onAddCreator}
              icon={<PlusIcon />}
            />
            <PanelHeaderButton
              label="Add folder"
              pressed={creating}
              onClick={() => setCreating((shown) => !shown)}
              icon={<FolderPlusIcon />}
            />
            <PanelHeaderButton
              label="Manage creators and folders"
              onClick={onManage}
              icon={<SettingsIcon />}
            />
          </div>
        }
      />
      {creating ? (
        <form
          className="grid shrink-0 gap-2 border-b p-3"
          onSubmit={(event) => void submitNewFolder(event)}
        >
          <Label htmlFor="new-creator-folder-name">Folder name</Label>
          <div className="flex gap-2">
            <Input
              id="new-creator-folder-name"
              autoFocus
              placeholder="Trusted"
              value={newName}
              maxLength={80}
              disabled={actions.busy}
              onChange={(event) => setNewName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  setCreating(false)
                  setNewName("")
                }
              }}
            />
            <Button
              type="submit"
              disabled={actions.busy || !newName.trim()}
            >
              Create folder
            </Button>
          </div>
        </form>
      ) : null}
      <ScrollArea className="min-h-0 flex-1">
        {creators.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">
            You are not tracking anyone yet. Add a creator with the + above and
            their posts fill the feed.
          </p>
        ) : (
          <div>
            <ScopeRow
              name="Everyone"
              count={creators.length}
              selected={everyonePicked}
              onPick={() => onPickCreator(null)}
            />
            {shownFolders.map((folder) => {
              const expanded = expandedId === folder.id
              const members = folder.creatorIds.flatMap((id) => {
                const creator = byId.get(id)
                return creator ? [creator] : []
              })
              return (
                <div key={folder.id}>
                  <div
                    className={cn(
                      "flex h-9 w-full items-center border-b",
                      scope.folderId === folder.id
                        ? "bg-muted"
                        : "hover:bg-muted/50"
                    )}
                  >
                    <button
                      type="button"
                      aria-pressed={scope.folderId === folder.id}
                      className={cn(
                        "flex h-full min-w-0 flex-1 items-center gap-2 px-3 text-left text-sm font-medium",
                        focusRing
                      )}
                      onClick={() => {
                        if (scope.folderId === folder.id) {
                          onPickFolder(null)
                          return
                        }
                        onPickFolder(folder.id)
                        setExpandedId(folder.id)
                      }}
                    >
                      <span className="min-w-0 flex-1 truncate">
                        {folder.name}
                      </span>
                      <span className="text-xs font-normal text-muted-foreground tabular-nums">
                        {folder.creatorIds.length}
                      </span>
                    </button>
                    <button
                      type="button"
                      aria-label={
                        expanded
                          ? `Close ${folder.name}`
                          : `Open ${folder.name}`
                      }
                      aria-expanded={expanded}
                      className={cn("h-full px-2", focusRing)}
                      onClick={() =>
                        setExpandedId(expanded ? null : folder.id)
                      }
                    >
                      <ChevronRightIcon
                        className={cn(
                          "size-4 shrink-0 transition-transform",
                          expanded && "rotate-90"
                        )}
                      />
                    </button>
                  </div>
                  {expanded ? (
                    <div className="flex flex-col border-b bg-muted/30">
                      {members.length === 0 ? (
                        <p className="px-3 py-4 text-center text-xs text-muted-foreground">
                          {folder.name} is empty. The folder button on a
                          creator's row puts them in.
                        </p>
                      ) : (
                        members.map((creator) => (
                          <CreatorRow
                            key={creator.id}
                            creator={creator}
                            folders={folders}
                            selected={scope.creatorId === creator.id}
                            onPick={onPickCreator}
                            actions={actions}
                          />
                        ))
                      )}
                    </div>
                  ) : null}
                </div>
              )
            })}
            {ungrouped.length > 0 ? (
              <div>
                {shownFolders.length > 0 ? (
                  <p className="border-b px-3 py-1.5 text-xs text-muted-foreground">
                    In no folder
                  </p>
                ) : null}
                {ungrouped.map((creator) => (
                  <CreatorRow
                    key={creator.id}
                    creator={creator}
                    folders={folders}
                    selected={scope.creatorId === creator.id}
                    onPick={onPickCreator}
                    actions={actions}
                  />
                ))}
              </div>
            ) : null}
          </div>
        )}
      </ScrollArea>
    </>
  )
}

function PanelHeaderButton({
  label,
  icon,
  pressed,
  onClick,
}: {
  label: string
  icon: React.ReactNode
  pressed?: boolean
  onClick: () => void
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          aria-label={label}
          aria-pressed={pressed}
          onClick={onClick}
        >
          {icon}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

/** The Everyone row: not a folder, nothing to expand, nothing to edit. */
function ScopeRow({
  name,
  count,
  selected,
  onPick,
}: {
  name: string
  count: number
  selected: boolean
  onPick: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onPick}
      className={cn(
        "flex h-9 w-full items-center gap-2 border-b border-r-2 px-3 text-left text-sm font-medium",
        focusRing,
        selected
          ? "border-r-foreground bg-muted"
          : "border-r-transparent hover:bg-muted/50"
      )}
    >
      <span className="min-w-0 flex-1 truncate">{name}</span>
      <span className="text-xs font-normal text-muted-foreground tabular-nums">
        {count}
      </span>
    </button>
  )
}

function CreatorRow({
  creator,
  folders,
  selected,
  onPick,
  actions,
}: {
  creator: SocialFeedCreator
  folders: readonly SocialFolder[]
  selected: boolean
  onPick: (creatorId: string | null) => void
  actions: FolderActions
}) {
  return (
    <div
      className={cn(
        "flex h-9 w-full items-center border-r-2",
        selected
          ? "border-r-foreground bg-muted"
          : "border-r-transparent hover:bg-muted/50"
      )}
    >
      <button
        type="button"
        aria-pressed={selected}
        onClick={() => onPick(selected ? null : creator.id)}
        className={cn(
          "flex h-full min-w-0 flex-1 items-center gap-2 px-3 text-left",
          focusRing
        )}
      >
        <Avatar size="sm">
          {creator.picture ? (
            <AvatarImage src={creator.picture} alt="" />
          ) : null}
          <AvatarFallback>
            {creator.handle.slice(0, 1).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <span className="min-w-0 flex-1 truncate text-sm">
          @{creator.handle}
        </span>
      </button>
      <CreatorFolderMenu
        creator={creator}
        folders={folders}
        actions={actions}
      />
    </div>
  )
}

/**
 * The folder button on a creator's row, the markets panel's star with a
 * different subject: a tick per folder, and a new folder made with this
 * creator already in it.
 */
function CreatorFolderMenu({
  creator,
  folders,
  actions,
}: {
  creator: SocialFeedCreator
  folders: readonly SocialFolder[]
  actions: FolderActions
}) {
  const [name, setName] = React.useState("")
  const [attempted, setAttempted] = React.useState(false)
  const filled = folders.some((folder) =>
    folder.creatorIds.includes(creator.id)
  )
  const label = `Choose folders for @${creator.handle}`

  async function create() {
    setAttempted(true)
    if (!name.trim() || actions.busy) return
    const created = await actions.create(name, creator.id)
    if (!created) return
    setName("")
    setAttempted(false)
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={label}
          aria-pressed={filled}
          className={cn(
            "mr-1 rounded p-1 text-muted-foreground hover:text-foreground",
            filled && "text-foreground",
            focusRing
          )}
        >
          <FolderIcon
            className="size-4"
            fill={filled ? "currentColor" : "none"}
          />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-56 p-1.5">
        <p className="px-2 py-1.5 text-xs font-medium">Save to folder</p>
        {folders.length > 0 ? (
          <div className="grid gap-0.5">
            {folders.map((folder) => (
              <label
                key={folder.id}
                className="flex h-8 cursor-pointer items-center gap-2 rounded-md px-2 text-sm hover:bg-muted"
              >
                <Checkbox
                  checked={folder.creatorIds.includes(creator.id)}
                  disabled={actions.busy}
                  onCheckedChange={(next) =>
                    actions.toggle(folder.id, creator.id, next === true)
                  }
                />
                <span className="min-w-0 flex-1 truncate">{folder.name}</span>
              </label>
            ))}
          </div>
        ) : (
          <p className="px-2 py-1.5 text-xs text-muted-foreground">
            No folders yet. Name the first one below.
          </p>
        )}
        <div className="mt-1 flex gap-2 px-1 pb-1">
          <Input
            aria-label="Folder name"
            aria-invalid={attempted && !name.trim()}
            placeholder="Trusted"
            maxLength={80}
            value={name}
            disabled={actions.busy}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              event.stopPropagation()
              if (event.key === "Enter") {
                event.preventDefault()
                void create()
              }
            }}
          />
          <Button
            type="button"
            size="icon"
            variant="outline"
            disabled={actions.busy}
            aria-disabled={actions.busy || !name.trim()}
            aria-label="Create folder"
            onClick={() => void create()}
          >
            <PlusIcon />
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
