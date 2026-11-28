import { SHRINKING_MENU } from "@/components/content-app/project-top"
import { ViewMenu } from "@/components/shared/view-menu"
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
 */
export function ContentKindMenu({ value, onPick }: { value: "all" | ArchiveItemKind; onPick: (next: "all" | ArchiveItemKind) => void }) {
  return (
    <span className={SHRINKING_MENU}>
      <ViewMenu
        label="Which content"
        value={value}
        onValueChange={(next) => onPick(next as "all" | ArchiveItemKind)}
        choices={[
          { value: "all", label: "All content" },
          ...ARCHIVE_ITEM_KINDS.map((kind) => ({ value: kind, label: `${ARCHIVE_KIND_LABELS[kind]}s` })),
        ]}
      />
    </span>
  )
}

export type ContentStatus = "all" | "draft" | "published"

export function ContentStatusMenu({ value, onPick }: { value: ContentStatus; onPick: (next: ContentStatus) => void }) {
  return (
    <span className={SHRINKING_MENU}>
      <ViewMenu
        label="Which status"
        value={value}
        onValueChange={(next) => onPick(next as ContentStatus)}
        choices={[
          { value: "all", label: "All statuses" },
          { value: "draft", label: "Draft" },
          { value: "published", label: "Published" },
        ]}
      />
    </span>
  )
}
