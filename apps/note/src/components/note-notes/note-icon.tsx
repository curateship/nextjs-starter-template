import * as React from "react"
import {
  BookIcon,
  BookmarkIcon,
  BrainIcon,
  BriefcaseIcon,
  CalendarIcon,
  CameraIcon,
  CodeIcon,
  CoffeeIcon,
  DollarSignIcon,
  FileTextIcon,
  FlagIcon,
  FolderIcon,
  GlobeIcon,
  GraduationCapIcon,
  HeartIcon,
  HomeIcon,
  LightbulbIcon,
  ListChecksIcon,
  MapPinIcon,
  MusicIcon,
  PlaneIcon,
  RocketIcon,
  SmilePlusIcon,
  StarIcon,
  UsersIcon,
  type LucideIcon,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import {
  EMOJI_PREFIX,
  ICON_PREFIX,
  NOTE_EMOJIS,
  NOTE_ICON_NAMES,
  type NoteIconName,
} from "@/lib/note/notes/icons"
import { focusRing } from "@/lib/layout/focus-ring"
import { cn } from "@/lib/utils"

const PICTURES: Record<NoteIconName, LucideIcon> = {
  book: BookIcon,
  bookmark: BookmarkIcon,
  brain: BrainIcon,
  briefcase: BriefcaseIcon,
  calendar: CalendarIcon,
  camera: CameraIcon,
  code: CodeIcon,
  coffee: CoffeeIcon,
  dollar: DollarSignIcon,
  file: FileTextIcon,
  flag: FlagIcon,
  folder: FolderIcon,
  globe: GlobeIcon,
  school: GraduationCapIcon,
  heart: HeartIcon,
  home: HomeIcon,
  idea: LightbulbIcon,
  checklist: ListChecksIcon,
  place: MapPinIcon,
  music: MusicIcon,
  travel: PlaneIcon,
  rocket: RocketIcon,
  star: StarIcon,
  people: UsersIcon,
}

/** A note's or folder's icon as drawn, or the fallback when it has none. */
export function NoteIcon({
  icon,
  fallback: Fallback = FileTextIcon,
  className,
}: {
  icon: string | null
  fallback?: LucideIcon
  className?: string
}) {
  if (icon?.startsWith(EMOJI_PREFIX)) {
    return (
      <span aria-hidden className={cn("inline-flex size-4 shrink-0 items-center justify-center leading-none", className)}>
        {icon.slice(EMOJI_PREFIX.length)}
      </span>
    )
  }
  const Picture =
    icon?.startsWith(ICON_PREFIX) ? PICTURES[icon.slice(ICON_PREFIX.length) as NoteIconName] : undefined
  const Drawn = Picture ?? Fallback
  return <Drawn aria-hidden className={cn("size-4 shrink-0", className)} />
}

/**
 * The icon picker: the app's own pictures, then emoji, then Remove. A pick
 * saves at once, the way every other choice on the note does.
 */
export function IconPicker({
  icon,
  label,
  onPick,
  size = "icon-sm",
  empty,
}: {
  icon: string | null
  label: string
  onPick: (icon: string | null) => void
  size?: "icon-xs" | "icon-sm" | "icon"
  /** What the button shows with no icon picked; a smiley "add" by default. */
  empty?: LucideIcon
}) {
  const [open, setOpen] = React.useState(false)
  function pick(next: string | null) {
    onPick(next)
    setOpen(false)
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button type="button" variant="ghost" size={size} aria-label={label}>
              {icon ? (
                <NoteIcon icon={icon} className={size === "icon-xs" ? "size-3.5" : "size-5"} />
              ) : empty ? (
                <NoteIcon icon={null} fallback={empty} className="size-3.5 text-muted-foreground" />
              ) : (
                <SmilePlusIcon />
              )}
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
      <PopoverContent align="start" className="grid w-72 gap-3 p-3">
        <div className="grid grid-cols-8 gap-1" role="group" aria-label="Pictures">
          {NOTE_ICON_NAMES.map((name) => {
            const Picture = PICTURES[name]
            const value = `${ICON_PREFIX}${name}`
            return (
              <button
                key={name}
                type="button"
                aria-label={name}
                aria-pressed={icon === value}
                onClick={() => pick(value)}
                className={cn(
                  "flex size-7 items-center justify-center rounded-md hover:bg-muted aria-pressed:bg-muted",
                  focusRing
                )}
              >
                <Picture className="size-4" />
              </button>
            )
          })}
        </div>
        <div className="grid grid-cols-8 gap-1 border-t pt-3" role="group" aria-label="Emoji">
          {NOTE_EMOJIS.map((emoji) => {
            const value = `${EMOJI_PREFIX}${emoji}`
            return (
              <button
                key={emoji}
                type="button"
                aria-label={emoji}
                aria-pressed={icon === value}
                onClick={() => pick(value)}
                className={cn(
                  "flex size-7 items-center justify-center rounded-md text-base hover:bg-muted aria-pressed:bg-muted",
                  focusRing
                )}
              >
                {emoji}
              </button>
            )
          })}
        </div>
        {icon ? (
          <Button type="button" variant="outline" size="sm" onClick={() => pick(null)}>
            Remove icon
          </Button>
        ) : null}
      </PopoverContent>
    </Popover>
  )
}
