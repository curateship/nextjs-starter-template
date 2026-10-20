import * as React from "react"
import { CheckIcon, ChevronDownIcon, SearchIcon, UserIcon, UsersIcon } from "lucide-react"

import { PersonAvatar } from "@/components/project/task-bits"
import { DashboardToolbarButton, DashboardToolbarSearch } from "@/components/shared/dashboard-toolbar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import type { ProjectMemberRow } from "@/lib/api/project/projects"
import { plural } from "@/lib/format/plural"
import { NOBODY_FILTER } from "@/lib/project/task-filters"
import { cn } from "@/lib/utils"

/**
 * The search as a magnifying glass that opens into the box. It stays open
 * while something is typed; Escape empties and closes it.
 */
export function SearchToggle({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [open, setOpen] = React.useState(false)
  if (open || value) {
    return (
      <DashboardToolbarSearch
        autoFocus={open}
        inputClassName="sm:w-44 lg:w-48"
        name="task-search"
        aria-label="Search tasks by title and notes"
        placeholder="Search tasks"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onBlur={() => setOpen(false)}
        onKeyDown={(event) => {
          if (event.key !== "Escape") return
          onChange("")
          setOpen(false)
        }}
      />
    )
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <DashboardToolbarButton
          type="button"
          variant="ghost"
          className="w-8 px-0"
          aria-label="Search tasks"
          onClick={() => setOpen(true)}
        >
          <SearchIcon className="size-4" />
        </DashboardToolbarButton>
      </TooltipTrigger>
      <TooltipContent>Search tasks</TooltipContent>
    </Tooltip>
  )
}

/**
 * Whose tasks show, in the header instead of the left panel (Tyler, 14 Oct
 * 2026): All members, each member with their role and open tasks, and
 * Unassigned. The button shows the members' faces, or the one picked.
 */
export function MembersFilterMenu({
  members,
  myUserId,
  openTotal,
  openUnassigned,
  value,
  onChange,
}: {
  members: ProjectMemberRow[]
  myUserId: string
  /** Open tasks on the project, and those with nobody assigned. */
  openTotal: number
  openUnassigned: number
  /** A member's id, `NOBODY_FILTER`, or nothing for everyone. */
  value: string | undefined
  onChange: (value: string | undefined) => void
}) {
  const picked = members.find((member) => member.userId === value)
  // A link can name someone who has since left the project; the filter still holds until changed.
  const label = picked
    ? picked.name
    : value === NOBODY_FILTER
      ? "Unassigned"
      : value
        ? "Someone no longer on the project"
        : "All members"
  const openTasks = (count: number) => `${count} open ${plural(count, "task")}`
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <DashboardToolbarButton type="button" variant="ghost" className="gap-1.5 px-1.5" aria-label={`Showing: ${label}`}>
          {picked ? (
            <PersonAvatar name={picked.name} avatarUrl={picked.avatarUrl} />
          ) : value ? (
            <IconCircle icon={UserIcon} />
          ) : (
            <span className="flex -space-x-2">
              {members.slice(0, 3).map((member) => (
                <PersonAvatar
                  key={member.userId}
                  name={member.name}
                  avatarUrl={member.avatarUrl}
                  className="ring-2 ring-card"
                />
              ))}
              {members.length === 0 ? <IconCircle icon={UsersIcon} /> : null}
            </span>
          )}
          <ChevronDownIcon className="size-4 text-muted-foreground" />
        </DashboardToolbarButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <MemberItem
          checked={!value}
          onSelect={() => onChange(undefined)}
          face={<IconCircle icon={UsersIcon} size="default" />}
          name="All members"
          detail={openTasks(openTotal)}
        />
        {members.map((member) => (
          <MemberItem
            key={member.userId}
            checked={value === member.userId}
            onSelect={() => onChange(member.userId)}
            face={<PersonAvatar name={member.name} avatarUrl={member.avatarUrl} size="default" />}
            name={member.userId === myUserId ? `${member.name} (you)` : member.name}
            detail={member.title ? `${member.title} · ${openTasks(member.openTasks)}` : openTasks(member.openTasks)}
          />
        ))}
        <MemberItem
          checked={value === NOBODY_FILTER}
          onSelect={() => onChange(NOBODY_FILTER)}
          face={<IconCircle icon={UserIcon} size="default" />}
          name="Unassigned"
          detail={openTasks(openUnassigned)}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function MemberItem({
  checked,
  onSelect,
  face,
  name,
  detail,
}: {
  checked: boolean
  onSelect: () => void
  face: React.ReactNode
  name: string
  detail: string
}) {
  return (
    <DropdownMenuItem onSelect={onSelect} aria-checked={checked} role="menuitemcheckbox" className="gap-3 py-2">
      {face}
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{name}</span>
        <span className="block truncate text-xs text-muted-foreground">{detail}</span>
      </span>
      {checked ? <CheckIcon className="size-4" /> : null}
    </DropdownMenuItem>
  )
}

/** A grey circle the size of a face, for "All members" and "Unassigned". */
function IconCircle({ icon: Icon, size = "sm" }: { icon: typeof UsersIcon; size?: "sm" | "default" }) {
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground",
        size === "sm" ? "size-6" : "size-8"
      )}
    >
      <Icon className={size === "sm" ? "size-3.5" : "size-4"} aria-hidden />
    </span>
  )
}
