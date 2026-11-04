import * as React from "react"

import type { ThumbnailRow, ThumbnailTemplateRow } from "@/lib/api/video/thumbnails"
import type { ImageModelId } from "@/lib/video/asset-factories"
import type { ThumbnailLayer, ThumbnailShape } from "@/lib/video/thumbnails"

// The provider lives in thumbnail-provider.tsx: a file that exports a
// component may export only components, or fast refresh stops working.

/** How many versions each AI press makes (Tyler, 3 Nov 2026: 1, 2 or 4). */
export const AI_TRIES = [1, 2, 4] as const
export type AiTries = (typeof AI_TRIES)[number]

export type BoardDesign = {
  layers: ThumbnailLayer[]
  backgroundColor: string
}

/**
 * The Thumbnail section's shared state (thumbnails.md): the open video's
 * thumbnails and the site's templates, the one open on the board, the layer
 * picked on it, and whatever AI press is running. The panel on the left, the
 * board in the middle and the panel on the right all read it.
 */
export type ThumbnailsValue = {
  list: ThumbnailRow[] | null
  templates: ThumbnailTemplateRow[]
  loadError: string | null
  open: ThumbnailRow | null
  design: BoardDesign | null
  selectedLayerId: string | null
  saving: "saved" | "saving" | "error"
  /** Words for the AI press under way, such as "Making 4 versions…". */
  busy: string | null
  tries: AiTries
  model: ImageModelId
  /** The picture a layer showed before an AI change, for the slider. */
  beforeAfter: { layerId: string; beforeUrl: string } | null
  reload: () => void
  openThumbnail: (id: string) => void
  create: (options: { shape: ThumbnailShape; templateId?: string; blank?: boolean }) => Promise<void>
  /** A version the AI or a copy made: listed first and opened. */
  addVersion: (row: ThumbnailRow) => void
  /** Puts a refreshed row in the list, such as after a star or a title. */
  replaceRow: (row: ThumbnailRow) => void
  removeRow: (id: string) => void
  setTemplates: (templates: ThumbnailTemplateRow[]) => void
  /** Changes the open design; it saves itself 0.7 seconds later. */
  change: (next: (design: BoardDesign) => BoardDesign) => void
  selectLayer: (id: string | null) => void
  setTries: (tries: AiTries) => void
  setModel: (model: ImageModelId) => void
  setBeforeAfter: (value: { layerId: string; beforeUrl: string } | null) => void
  /** Runs an AI press with its words shown, and reports a failure. */
  run: (label: string, work: () => Promise<void>) => Promise<void>
}

export const ThumbnailsContext = React.createContext<ThumbnailsValue | null>(null)

export function useThumbnails() {
  const value = React.useContext(ThumbnailsContext)
  if (!value) throw new Error("Thumbnail pieces must be used inside ThumbnailsProvider")
  return value
}

/** The picked layer of the open design, or null. */
export function useSelectedLayer() {
  const { design, selectedLayerId } = useThumbnails()
  return design?.layers.find((layer) => layer.id === selectedLayerId) ?? null
}
