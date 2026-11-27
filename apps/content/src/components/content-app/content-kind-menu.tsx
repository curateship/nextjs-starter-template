import { SHRINKING_MENU } from "@/components/content-app/project-top"
import { ViewMenu } from "@/components/shared/view-menu"
import { ARCHIVE_KIND_LABELS, ARCHIVE_ITEM_KINDS, type ArchiveItemKind } from "@/lib/archive/items"

/** What Content shows: the Archive, one kind of it, or the editor's videos (Drafts). */
export type ContentKind = "all" | ArchiveItemKind | "drafts"

/**
 * Content's one dropdown, after the search icon (Tyler, 27 Nov 2026: "remove
 * the all items and videos dropdown and rename every kind to "All content"",
 * then the project's editor videos "In All content"):
 *
 * - **All content**, the project's Archive;
 * - **Videos, Carousels, Pictures**, one kind of it;
 * - **Drafts**, the project's videos in the editor, with New video. Left out
 *   where there are none to show, as for a guest from Project.
 *
 * The Archive's header and the Drafts list both draw it, so either reaches
 * the other.
 */
export function ContentKindMenu({ value, onPick, drafts }: { value: ContentKind; onPick: (next: ContentKind) => void; drafts: boolean }) {
  return (
    <span className={SHRINKING_MENU}>
      <ViewMenu
        label="Which content"
        value={value}
        onValueChange={(next) => onPick(next as ContentKind)}
        choices={[
          { value: "all", label: "All content" },
          ...ARCHIVE_ITEM_KINDS.map((kind) => ({ value: kind, label: `${ARCHIVE_KIND_LABELS[kind]}s` })),
          ...(drafts ? [{ value: "drafts", label: "Drafts" }] : []),
        ]}
      />
    </span>
  )
}
