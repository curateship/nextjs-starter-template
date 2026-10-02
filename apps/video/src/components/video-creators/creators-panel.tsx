import * as React from "react"
import {
  ChevronRightIcon,
  FolderPlusIcon,
  PlusIcon,
  SettingsIcon,
  UsersIcon,
} from "lucide-react"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { DashboardCardTitleHeader } from "@/components/shared/dashboard-card-header"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { focusRing } from "@/lib/layout/focus-ring"
import {
  CREATOR_FOLDER_NAME_MAX,
  creatorPlatformLabels,
  formatCount,
  type CreatorFeedScope,
  type CreatorFolder,
  type ResearchCreator,
} from "@/lib/video/creators"

/**
 * The left panel: who you follow, in folders.
 *
 * Copied in behaviour from the trade app's social feed, because the problem is
 * the same one — a list of people you want to sort without committing each of
 * them to exactly one box. A creator can sit in several folders, which is why
 * ticking is a menu of checkboxes rather than a single choice.
 */

export type FolderActions = {
  busy: boolean
  create: (name: string, firstCreatorId?: string) => Promise<boolean>
  toggleCreator: (folderId: string, creatorId: string, saved: boolean) => void
}

export function CreatorsPanel({
  folders,
  creators,
  scope,
  actions,
  onPickFolder,
  onPickCreator,
  onAddCreator,
  onManage,
}: {
  folders: readonly CreatorFolder[]
  creators: readonly ResearchCreator[]
  scope: CreatorFeedScope
  actions: FolderActions
  /** Null widens back out to everyone. */
  onPickFolder: (folderId: string | null) => void
  onPickCreator: (creatorId: string | null) => void
  onAddCreator: () => void
  onManage: () => void
}) {
  const [expandedId, setExpandedId] = React.useState<string | null>(null)
  const [naming, setNaming] = React.useState(false)
  const [newName, setNewName] = React.useState("")

  const byId = React.useMemo(
    () => new Map(creators.map((creator) => [creator.id, creator])),
    [creators]
  )
  const shownFolders = React.useMemo(
    () =>
      [...folders]
        .filter((folder) => !folder.hidden)
        .sort((left, right) => left.position - right.position),
    [folders]
  )
  // Loose creators are those in no folder at all, hidden folders counted:
  // hiding a folder keeps its creators, and they must not reappear down here
  // as though they had none.
  const loose = React.useMemo(() => {
    const filed = new Set(folders.flatMap((folder) => folder.creatorIds))
    return creators.filter((creator) => !filed.has(creator.id))
  }, [creators, folders])

  async function submitNewFolder(event: React.FormEvent) {
    event.preventDefault()
    if (actions.busy || !newName.trim()) return
    if (!(await actions.create(newName))) return
    setNewName("")
    setNaming(false)
  }

  const everyone = scope.folderId === null && scope.creatorId === null

  return (
    <>
      <DashboardCardTitleHeader
        icon={<UsersIcon />}
        title="Creators"
        action={
          <div className="flex items-center gap-1">
            <HeaderButton
              label="Follow a creator"
              onClick={onAddCreator}
              icon={<PlusIcon />}
            />
            <HeaderButton
              label="New folder"
              pressed={naming}
              onClick={() => setNaming((shown) => !shown)}
              icon={<FolderPlusIcon />}
            />
            <HeaderButton
              label="Manage folders"
              onClick={onManage}
              icon={<SettingsIcon />}
            />
          </div>
        }
      />
      {naming ? (
        <form
          className="grid shrink-0 gap-2 border-b p-3"
          onSubmit={(event) => void submitNewFolder(event)}
        >
          <Label htmlFor="new-creator-folder">Folder name</Label>
          <div className="flex gap-2">
            <Input
              id="new-creator-folder"
              autoFocus
              placeholder="Hooks"
              value={newName}
              maxLength={CREATOR_FOLDER_NAME_MAX}
              disabled={actions.busy}
              onChange={(event) => setNewName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  setNaming(false)
                  setNewName("")
                }
              }}
            />
            <Button type="submit" disabled={actions.busy || !newName.trim()}>
              Create folder
            </Button>
          </div>
        </form>
      ) : null}
      <ScrollArea className="min-h-0 flex-1">
        {creators.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">
            You are not following anyone yet. Add a creator with the + above and
            their videos fill the middle.
          </p>
        ) : (
          <div>
            <ScopeRow
              name="Everyone"
              count={creators.length}
              selected={everyone}
              onPick={() => onPickCreator(null)}
            />
            {shownFolders.map((folder) => {
              const open = expandedId === folder.id
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
                        // Clicking the folder you are already in widens back
                        // out, so one control both narrows and clears.
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
                        open ? `Close ${folder.name}` : `Open ${folder.name}`
                      }
                      aria-expanded={open}
                      className={cn("h-full px-2", focusRing)}
                      onClick={() => setExpandedId(open ? null : folder.id)}
                    >
                      <ChevronRightIcon
                        className={cn(
                          "size-4 shrink-0 transition-transform",
                          open && "rotate-90"
                        )}
                      />
                    </button>
                  </div>
                  {open ? (
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
            {loose.length > 0 ? (
              <div>
                {shownFolders.length > 0 ? (
                  <p className="border-b px-3 py-1.5 text-xs text-muted-foreground">
                    In no folder
                  </p>
                ) : null}
                {loose.map((creator) => (
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

function HeaderButton({
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
          size="icon-sm"
          variant={pressed ? "secondary" : "ghost"}
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
        "flex h-9 w-full items-center gap-2 border-b px-3 text-left text-sm font-medium",
        selected ? "bg-muted" : "hover:bg-muted/50",
        focusRing
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
  creator: ResearchCreator
  folders: readonly CreatorFolder[]
  selected: boolean
  onPick: (creatorId: string | null) => void
  actions: FolderActions
}) {
  return (
    <div
      className={cn(
        "flex h-11 w-full items-center border-b",
        selected ? "bg-muted" : "hover:bg-muted/50"
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
        <Avatar className="size-6 shrink-0">
          {creator.avatarUrl ? <AvatarImage src={creator.avatarUrl} alt="" /> : null}
          <AvatarFallback className="text-[10px]">
            {creator.handle.slice(0, 2).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm">
            {creator.displayName ?? `@${creator.handle}`}
          </span>
          <span className="truncate text-xs text-muted-foreground tabular-nums">
            {creatorPlatformLabels[creator.platform]}
            {creator.followerCount !== null
              ? ` · ${formatCount(creator.followerCount)} followers`
              : ""}
            {creator.viewsPerDay !== null
              ? ` · ${formatCount(creator.viewsPerDay)} views a day`
              : ""}
          </span>
        </span>
      </button>
      <FolderMenu creator={creator} folders={folders} actions={actions} />
    </div>
  )
}

/**
 * Which folders this creator is in. A checkbox each rather than one choice,
 * because somebody can be both a competitor and worth studying for hooks.
 * Naming a new folder in here puts them in it at the same time.
 */
function FolderMenu({
  creator,
  folders,
  actions,
}: {
  creator: ResearchCreator
  folders: readonly CreatorFolder[]
  actions: FolderActions
}) {
  const [open, setOpen] = React.useState(false)
  const [name, setName] = React.useState("")

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (actions.busy || !name.trim()) return
    if (!(await actions.create(name, creator.id))) return
    setName("")
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          aria-label={`Folders for @${creator.handle}`}
          className="mr-1"
        >
          <FolderPlusIcon />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-60 p-0">
        <p className="border-b px-3 py-2 text-xs text-muted-foreground">
          Folders for @{creator.handle}
        </p>
        <div className="max-h-56 overflow-y-auto">
          {folders.length === 0 ? (
            <p className="px-3 py-3 text-xs text-muted-foreground">
              No folders yet. Name one below.
            </p>
          ) : (
            folders.map((folder) => {
              const inIt = folder.creatorIds.includes(creator.id)
              return (
                <label
                  key={folder.id}
                  className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm hover:bg-muted/50"
                >
                  <Checkbox
                    checked={inIt}
                    onCheckedChange={(checked) =>
                      actions.toggleCreator(folder.id, creator.id, !!checked)
                    }
                  />
                  <span className="min-w-0 flex-1 truncate">{folder.name}</span>
                </label>
              )
            })
          )}
        </div>
        <form className="grid gap-2 border-t p-3" onSubmit={(e) => void submit(e)}>
          <Label htmlFor={`folder-for-${creator.id}`} className="text-xs">
            New folder
          </Label>
          <div className="flex gap-2">
            <Input
              id={`folder-for-${creator.id}`}
              placeholder="Hooks"
              value={name}
              maxLength={CREATOR_FOLDER_NAME_MAX}
              disabled={actions.busy}
              onChange={(event) => setName(event.target.value)}
            />
            <Button type="submit" size="sm" disabled={actions.busy || !name.trim()}>
              Add
            </Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  )
}
