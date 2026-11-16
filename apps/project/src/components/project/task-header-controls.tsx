import * as React from "react"
import { CheckIcon, ChevronDownIcon, ListChecksIcon, SearchIcon, UserIcon, UsersIcon } from "lucide-react"

import { PersonAvatar } from "@/components/project/task-bits"
import { DashboardToolbarButton, DashboardToolbarSearch } from "@/components/shared/dashboard-toolbar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import type { ProjectMemberRow } from "@/lib/api/project/projects"
import { plural } from "@/lib/format/plural"
import { NOBODY_FILTER } from "@/lib/project/task-filters"
import { NARROW_SEARCH, NARROW_SQUARE, NARROW_WORD, type TaskHeaderNarrow } from "@/lib/project/task-header-look"
import { cn } from "@/lib/utils"

/**
 * The search box, always in the header (Tyler, 16 Nov 2026: "move the mass
 * select and search outside", out of the ⋮ they sat in since 6 Nov). Escape
 * empties it. In a header under 672px wide, as on a phone, the box would
 * squeeze the tabs to nothing, so it shows as a magnifying glass there and
 * opens into the box while it is used or holds words.
 */
export function TaskSearchBox({
  value,
  onChange,
  narrow = "normal",
  what = "tasks",
  boxClassName,
}: {
  value: string
  onChange: (value: string) => void
  narrow?: TaskHeaderNarrow
  /** What it searches, for its words: a project's Notes and Milestones dashboards have one too. */
  what?: "tasks" | "notes" | "milestones"
  /** The box's widths in place of the task headers' narrowing, for a header with more room. */
  boxClassName?: string
}) {
  const [open, setOpen] = React.useState(false)
  const box = React.useRef<HTMLInputElement>(null)
  React.useEffect(() => {
    if (open) box.current?.focus()
  }, [open])
  const showBox = open || Boolean(value)
  return (
    <>
      <DashboardToolbarSearch
        ref={box}
        className={cn("min-w-0 shrink", !showBox && "@max-2xl:hidden")}
        // The clear button's room on the right is kept only once there are words to clear.
        inputClassName={cn(boxClassName ?? NARROW_SEARCH[narrow], !value && "pr-2")}
        name={`${what}-search`}
        aria-label={what === "tasks" ? "Search tasks by title and notes" : `Search ${what}`}
        placeholder={`Search ${what}`}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onBlur={() => setOpen(false)}
        onKeyDown={(event) => {
          if (event.key !== "Escape") return
          if (value) onChange("")
          setOpen(false)
        }}
      />
      {showBox ? null : (
        <DashboardToolbarButton
          type="button"
          variant="ghost"
          className="hidden w-8 px-0 @max-2xl:inline-flex"
          aria-label={`Search ${what}`}
          onClick={() => setOpen(true)}
        >
          <SearchIcon className="size-4" />
        </DashboardToolbarButton>
      )}
    </>
  )
}

/**
 * Mass select, right after the search box: an icon and the word Select,
 * pressed while on ("Hide select" to a screen reader). In a narrow header
 * the word drops and the icon stays.
 */
export function TaskSelectButton({
  on,
  onToggle,
  narrow = "normal",
}: {
  on: boolean
  onToggle: () => void
  narrow?: TaskHeaderNarrow
}) {
  return (
    <DashboardToolbarButton
      type="button"
      variant="outline"
      aria-pressed={on}
      aria-label={on ? "Hide select" : "Mass select"}
      className={cn(NARROW_SQUARE[narrow], on && "bg-muted")}
      onClick={onToggle}
    >
      <ListChecksIcon className="size-4" />
      <span className={NARROW_WORD[narrow]}>Select</span>
    </DashboardToolbarButton>
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
