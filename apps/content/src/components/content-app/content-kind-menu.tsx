import {
  CheckIcon,
  ChevronDownIcon,
  CircleCheckIcon,
  CircleDashedIcon,
  FilmIcon,
  GalleryHorizontalIcon,
  ImageIcon,
  LayersIcon,
  PencilLineIcon,
  type LucideIcon,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { ARCHIVE_KIND_LABELS, ARCHIVE_ITEM_KINDS, type ArchiveItemKind } from "@/lib/archive/items"

/**
 * Content's two dropdowns, after the search icon (Tyler, 27 Nov 2026: "remove
 * the all items and videos dropdown and rename every kind to "All content"",
 * then "There should be another drop down for "Status" and move draft there,
 * we also need Published"):
 *
 * - **What kind** (`ContentKindMenu`): All content, Videos, Carousels,
 *   Pictures.
 * - **Status** (`ContentStatusMenu`): All statuses, Draft (the project's
 *   videos still in the editor) and Published (everything in the Archive).
 *   Left out for a guest from Project, who has no drafts.
 *
 * Each choice has an icon. In a header narrower than 768px, as on a phone, the
 * button shows the icon alone: both dropdowns' words start with "All", so cut
 * short they read "A…" and "A…" and can't be told apart.
 */
export function ContentKindMenu({ value, onPick }: { value: "all" | ArchiveItemKind; onPick: (next: "all" | ArchiveItemKind) => void }) {
  return (
    <IconChoiceMenu
      label="Which content"
      value={value}
      onPick={onPick}
      choices={[
        { value: "all", label: "All content", icon: LayersIcon },
        ...ARCHIVE_ITEM_KINDS.map((kind) => ({ value: kind, label: `${ARCHIVE_KIND_LABELS[kind]}s`, icon: KIND_ICONS[kind] })),
      ]}
    />
  )
}

export type ContentStatus = "all" | "draft" | "published"

export function ContentStatusMenu({ value, onPick }: { value: ContentStatus; onPick: (next: ContentStatus) => void }) {
  return (
    <IconChoiceMenu
      label="Which status"
      value={value}
      onPick={onPick}
      choices={[
        { value: "all", label: "All statuses", icon: CircleDashedIcon },
        { value: "draft", label: "Draft", icon: PencilLineIcon },
        { value: "published", label: "Published", icon: CircleCheckIcon },
      ]}
    />
  )
}

const KIND_ICONS: Record<ArchiveItemKind, LucideIcon> = {
  video: FilmIcon,
  carousel: GalleryHorizontalIcon,
  picture: ImageIcon,
}

/**
 * The shell's `ViewMenu`, drawn the same way, with an icon for each choice. A
 * ghost button, so the list header gives it the outline every header button
 * has. Its word cuts short with "…" before the header is pushed past its edge.
 */
function IconChoiceMenu<Value extends string>({
  label,
  value,
  onPick,
  choices,
}: {
  label: string
  value: Value
  onPick: (next: Value) => void
  choices: Array<{ value: Value; label: string; icon: LucideIcon }>
}) {
  const shown = choices.find((choice) => choice.value === value) ?? choices[0]
  const Icon = shown.icon
  return (
    <span className="flex min-w-0 shrink @3xl:min-w-24">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="ghost" aria-label={`${label}: ${shown.label}`} className="min-w-0 shrink gap-1.5 overflow-hidden">
            <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            <span className="min-w-0 truncate @max-3xl:sr-only">{shown.label}</span>
            <ChevronDownIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="max-h-[min(60vh,24rem)] min-w-48">
          {choices.map((choice) => {
            const ChoiceIcon = choice.icon
            return (
              <DropdownMenuItem key={choice.value} onSelect={() => onPick(choice.value)}>
                <ChoiceIcon className="size-4 text-muted-foreground" aria-hidden />
                <span className="min-w-0 flex-1 truncate">{choice.label}</span>
                <CheckIcon className={choice.value === value ? "size-4" : "size-4 opacity-0"} aria-hidden />
              </DropdownMenuItem>
            )
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    </span>
  )
}
