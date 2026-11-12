import * as React from "react"
import { LockIcon, LockOpenIcon, PlusIcon, XIcon } from "lucide-react"

import { MediaPicker } from "@/components/media/media-picker"
import { CoverSky } from "@/components/shared/notes/cover-sky"
import { PickRow } from "@/components/shared/notes/pick-rows"
import { MenuFooterButton } from "@/components/shared/notes/tabbed-menu"
import { focusRing } from "@/lib/layout/focus-ring"
import { MAX_COVER_IMAGES, SKY_COVER } from "@/lib/notes/page-cover"
import { cn } from "@/lib/utils"

/**
 * The two rows every page's ⋮ holds in the Admin 3 panel design, copied from
 * Trade's `page-menus.tsx` (7 Nov 2026): the cover photo, under a "Page"
 * group, and "Lock blocks" under the groups. An app's own ⋮ puts them in
 * its `TabbedMenu` beside its own rows.
 */

/**
 * "Lock blocks", the General tab's footer, under a line across the menu
 * (Tyler, 9 Nov 2026: "this should be in the bottom and rename it to \"Lock
 * blocks\"", then "this should sepearted with divider just like the new
 * plan footer"). Pass it as the tab's `footer`.
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
    <MenuFooterButton
      icon={locked ? <LockOpenIcon /> : <LockIcon />}
      disabled={busy}
      onClick={() => onLock(!locked)}
    >
      {locked ? "Unlock blocks" : "Lock blocks"}
    </MenuFooterButton>
  )
}

export type PageLock = {
  locked: boolean
  busy: boolean
  setLocked: (locked: boolean) => void
}

export type PageCover = {
  /** The cover picked: null for none, `SKY_COVER`, or a picture. */
  url: string | null
  /** The page's own pictures, each a tile to pick again. */
  images: string[]
  busy: boolean
  /** Saves the pick and the pictures together. */
  set: (next: { url: string | null; images: string[] }) => void
}

/**
 * The page's cover photo, as a row: what is picked on the right, and the tiles
 * in the small box the row opens (Tyler, 8 Nov 2026: "in project app we have
 * the morning, afternoon and night automated scene? add that but only use the
 * sky one. I also want to add custom images too and make the ui like this",
 * drawn as square tiles, the picked one ringed, a "+" last):
 *
 * - **None**, then **Sky** (Project's sky, following the viewer's clock),
 *   then each picture the page has had, then **+**, which opens the media
 *   library and picks what it brings back.
 * - A picture's tile has an × that takes it off the page's list; if it was
 *   the cover, the cover goes back to None.
 * - Up to `MAX_COVER_IMAGES` pictures; at that many, + is replaced by a line
 *   saying so.
 *
 * Every pick saves at once, as every row in a tabbed menu does.
 */
export function CoverRow({ cover }: { cover: PageCover }) {
  const [picking, setPicking] = React.useState(false)
  const value = cover.url === null ? "None" : cover.url === SKY_COVER ? "Sky" : "Picture"
  // A picture set as the cover before pages kept their pictures is the
  // list's first tile, so it can be picked again after trying the sky.
  const kept =
    cover.url && cover.url !== SKY_COVER && !cover.images.includes(cover.url)
      ? [cover.url, ...cover.images].slice(0, MAX_COVER_IMAGES)
      : cover.images
  const pick = (url: string | null) => {
    if (url !== cover.url) cover.set({ url, images: kept })
  }
  const add = (url: string) => {
    const images = kept.includes(url) ? kept : [...kept, url]
    cover.set({ url, images })
  }
  const remove = (url: string) =>
    cover.set({ url: cover.url === url ? null : cover.url, images: kept.filter((image) => image !== url) })
  const full = kept.length >= MAX_COVER_IMAGES
  return (
    <PickRow label="Cover photo" value={value} empty={cover.url === null} disabled={cover.busy}>
      <div className="grid grid-cols-3 gap-2.5" role="radiogroup" aria-label="Cover photo">
        <CoverTile label="None" picked={cover.url === null} disabled={cover.busy} onPick={() => pick(null)}>
          <span className="text-xs text-muted-foreground">None</span>
        </CoverTile>
        <CoverTile
          label="Sky, which follows the time of day"
          picked={cover.url === SKY_COVER}
          disabled={cover.busy}
          onPick={() => pick(SKY_COVER)}
        >
          <CoverSky />
        </CoverTile>
        {kept.map((image) => (
          <CoverTile
            key={image}
            label="Picture"
            picked={cover.url === image}
            disabled={cover.busy}
            onPick={() => pick(image)}
            onRemove={() => remove(image)}
          >
            <img src={image} alt="" className="absolute inset-0 size-full object-cover" />
          </CoverTile>
        ))}
        {full ? null : (
          <button
            type="button"
            aria-label="Add a picture"
            disabled={cover.busy}
            onClick={() => setPicking(true)}
            className={cn(
              "flex aspect-square items-center justify-center rounded-xl border bg-card text-foreground hover:bg-muted/50 disabled:opacity-50",
              focusRing
            )}
          >
            <PlusIcon className="size-5" />
          </button>
        )}
      </div>
      {full ? (
        <p className="text-xs text-muted-foreground">
          {MAX_COVER_IMAGES} pictures at most. Take one off with its × to add another.
        </p>
      ) : null}
      <MediaPicker
        open={picking}
        onOpenChange={setPicking}
        defaultCropAspect="wide"
        onSelectMedia={(url) => {
          setPicking(false)
          add(url)
        }}
      />
    </PickRow>
  )
}

/**
 * One square tile. The picked one has a dark ring with a white gap inside it,
 * as in Tyler's drawing.
 */
function CoverTile({
  label,
  picked,
  disabled,
  onPick,
  onRemove,
  children,
}: {
  label: string
  picked: boolean
  disabled: boolean
  onPick: () => void
  onRemove?: () => void
  children: React.ReactNode
}) {
  return (
    <div className="group/tile relative">
      <button
        type="button"
        role="radio"
        aria-checked={picked}
        aria-label={label}
        disabled={disabled}
        onClick={onPick}
        className={cn(
          "relative flex aspect-square w-full items-center justify-center overflow-hidden rounded-xl border bg-muted/40 disabled:opacity-50",
          picked && "border-transparent ring-[3px] ring-foreground ring-offset-2 ring-offset-popover",
          focusRing
        )}
      >
        {children}
      </button>
      {onRemove ? (
        <button
          type="button"
          aria-label="Take this picture off"
          disabled={disabled}
          onClick={onRemove}
          className={cn(
            "absolute -top-1.5 -right-1.5 flex size-5 items-center justify-center rounded-full border bg-popover text-muted-foreground opacity-0 shadow-sm group-hover/tile:opacity-100 hover:text-foreground focus-visible:opacity-100 [@media(hover:none)]:opacity-100",
            focusRing
          )}
        >
          <XIcon className="size-3" />
        </button>
      ) : null}
    </div>
  )
}
