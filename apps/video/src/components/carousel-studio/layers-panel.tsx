import {
  BlendIcon,
  EyeIcon,
  EyeOffIcon,
  FilmIcon,
  HashIcon,
  ImageIcon,
  LockIcon,
  LockOpenIcon,
  TypeIcon,
} from "lucide-react"

import type {
  CarouselSlide,
  CarouselSlideItem,
} from "@/lib/video/carousel-schema"
import { layerName } from "@/lib/video/carousel-layout"
import { cn } from "@/lib/utils"

const LAYER_ICONS = {
  text: TypeIcon,
  "slide-number": HashIcon,
  image: ImageIcon,
  video: FilmIcon,
  "gradient-shadow": BlendIcon,
} as const

/**
 * Every layer on the picked slide, the top one first, where a layer can be
 * picked, hidden or locked (workspace/docs/carousel-layers.md). A hidden
 * layer is not drawn or exported; a locked one cannot be dragged on the
 * canvas, so it is picked here instead.
 */
export function LayersPanelBody({
  slide,
  selectedItemIds,
  onSelectItem,
  onUpdateItem,
}: {
  slide: CarouselSlide
  selectedItemIds: string[]
  onSelectItem: (itemId: string, additive: boolean) => void
  onUpdateItem: (itemId: string, patch: Partial<CarouselSlideItem>) => void
}) {
  // The top of the stack first, as it is seen. Equal heights keep their saved
  // order, the later one on top, as the canvas draws them.
  const layers = slide.items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => b.item.zIndex - a.item.zIndex || b.index - a.index)
    .map(({ item }) => item)

  if (!layers.length) {
    return (
      <p className="text-sm text-muted-foreground">
        This slide has no layers yet. Add text, a picture or a shadow from the
        rail.
      </p>
    )
  }

  return (
    <ul aria-label="Layers on this slide" className="grid gap-1">
      {layers.map((item) => {
        const Icon = LAYER_ICONS[item.type]
        const picked = selectedItemIds.includes(item.id)
        const name = layerName(item)
        return (
          <li
            key={item.id}
            className={cn(
              "flex items-center gap-1 rounded-md border pr-1",
              picked ? "border-[var(--acc)] bg-muted" : "border-transparent"
            )}
          >
            <button
              type="button"
              aria-pressed={picked}
              onClick={(event) => onSelectItem(item.id, event.shiftKey)}
              className={cn(
                "flex h-8 min-w-0 flex-1 items-center gap-2 rounded-md px-2 text-left text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                item.hidden && "text-muted-foreground"
              )}
            >
              <Icon className="size-4 flex-none text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate">{name}</span>
            </button>
            <button
              type="button"
              aria-label={item.hidden ? `Show ${name}` : `Hide ${name}`}
              onClick={() =>
                onUpdateItem(item.id, { hidden: item.hidden ? undefined : true })
              }
              className="grid size-7 flex-none place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              {item.hidden ? (
                <EyeOffIcon className="size-4" />
              ) : (
                <EyeIcon className="size-4" />
              )}
            </button>
            <button
              type="button"
              aria-label={item.locked ? `Unlock ${name}` : `Lock ${name}`}
              onClick={() =>
                onUpdateItem(item.id, { locked: item.locked ? undefined : true })
              }
              className="grid size-7 flex-none place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              {item.locked ? (
                <LockIcon className="size-4" />
              ) : (
                <LockOpenIcon className="size-4" />
              )}
            </button>
          </li>
        )
      })}
    </ul>
  )
}
