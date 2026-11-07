import { LockIcon, LockOpenIcon } from "lucide-react"

import { ImageUpload } from "@/components/shared/image-upload"
import { PickRow } from "@/components/shared/notes/pick-rows"
import { Button } from "@/components/ui/button"

/**
 * The two rows every page's ⋮ holds in the Admin 3 panel design, copied from
 * Trade's `page-menus.tsx` (7 Nov 2026): the cover photo, under a "Page"
 * group, and "Lock the notes" under the groups. An app's own ⋮ puts them in
 * its `TabbedMenu` beside its own rows.
 */

/**
 * "Lock the notes", under a menu's groups, as on every page in the design.
 * Locked, the page reads only, blocks and all, and the server refuses a save.
 */
export function LockRow({
  locked,
  busy,
  onLock,
}: {
  locked: boolean
  busy: boolean
  onLock: (locked: boolean) => void
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      disabled={busy}
      className="w-full justify-start gap-2 px-2 font-normal"
      onClick={() => onLock(!locked)}
    >
      {locked ? (
        <LockOpenIcon className="size-4" />
      ) : (
        <LockIcon className="size-4" />
      )}
      {locked ? "Unlock the notes" : "Lock the notes"}
    </Button>
  )
}

export type PageLock = {
  locked: boolean
  busy: boolean
  setLocked: (locked: boolean) => void
}

export type PageCover = {
  url: string | null
  busy: boolean
  set: (url: string | null) => void
}

/**
 * The page's cover photo, as a row: "None" until one is added, and the
 * upload in the small box the row opens (Tyler, 7 Nov 2026: "both panel is
 * missing cover photo", then "the settings dropdown options needs to follow
 * standard"). The picture lies faintly behind the panel's header.
 */
export function CoverRow({ cover }: { cover: PageCover }) {
  return (
    <PickRow
      label="Cover photo"
      value={cover.url ? "Added" : "None"}
      empty={!cover.url}
      disabled={cover.busy}
    >
      <ImageUpload
        label="Cover photo"
        showLabel={false}
        value={cover.url ?? ""}
        aspect="video"
        fit="cover"
        emptyLabel="Add a cover photo"
        onChange={(url) => cover.set(url || null)}
      />
    </PickRow>
  )
}
