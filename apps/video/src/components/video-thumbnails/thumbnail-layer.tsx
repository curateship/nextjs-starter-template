import * as React from "react"

import { SlideLayerContent } from "@/components/carousel-studio/slide-layer"
import { shapePathsMarkup } from "@/lib/video/shapes"
import {
  asCarouselItem,
  layerEffectFilter,
  THUMBNAIL_SIZES,
  type ThumbnailDesign,
  type ThumbnailLayer,
  type ThumbnailShape,
  type ThumbnailShapeLayer,
} from "@/lib/video/thumbnails"

/**
 * One layer of a thumbnail as the download draws it (thumbnail-export.ts),
 * at `scale` screen pixels to a full-size pixel. Words and pictures are the
 * carousel's own drawing; the board's own looks are the same SVG filter the
 * download uses, pointed at from CSS.
 */
export function ThumbnailLayerView({
  layer,
  shape,
  scale,
  filterKey,
}: {
  layer: ThumbnailLayer
  shape: ThumbnailShape
  scale: number
  /** Keeps this layer's filter apart from every other one on the page. */
  filterKey: string
}) {
  const frame = THUMBNAIL_SIZES[shape]
  if (layer.type === "spot") {
    return (
      <div className="grid h-full w-full place-items-center border-2 border-dashed border-white/70 bg-black/30 text-xs text-white">
        Picture goes here
      </div>
    )
  }
  // A shape is drawn across the whole board by ShapesLayer, in the same
  // pixels as the download; its box only takes the presses.
  if (layer.type === "shape") return null
  const item = asCarouselItem(layer)
  if (!item) return null
  const id = `thumb-fx-${filterKey}`
  const filter = layerEffectFilter(layer, id, frame, scale, true)
  return (
    <>
      {filter ? (
        <svg aria-hidden="true" className="absolute size-0">
          <defs dangerouslySetInnerHTML={{ __html: filter }} />
        </svg>
      ) : null}
      <div className="h-full w-full" style={filter ? { filter: `url(#${id})` } : undefined}>
        <SlideLayerContent item={item} scale={scale} slideIndex={0} slideCount={1} />
      </div>
    </>
  )
}

/** Every arrow and circle of a design, over the whole board. */
export function ShapesLayer({
  layers,
  shape,
}: {
  layers: ThumbnailLayer[]
  shape: ThumbnailShape
}) {
  const frame = THUMBNAIL_SIZES[shape]
  const shapes = layers.filter(
    (layer): layer is ThumbnailShapeLayer => layer.type === "shape" && !layer.hidden
  )
  if (!shapes.length) return null
  return (
    <>
      {shapes.map((layer) => (
        <svg
          key={layer.id}
          aria-hidden="true"
          viewBox={`0 0 ${frame.width} ${frame.height}`}
          preserveAspectRatio="none"
          className="pointer-events-none absolute inset-0 h-full w-full"
          style={{ zIndex: layer.zIndex }}
          dangerouslySetInnerHTML={{
            __html: shapePathsMarkup(
              {
                shape: layer.shape,
                x: layer.x + layer.fromX * layer.width,
                y: layer.y + layer.fromY * layer.height,
                toX: layer.x + layer.toX * layer.width,
                toY: layer.y + layer.toY * layer.height,
                color: layer.color,
                lineWidth: layer.lineWidth,
              },
              frame,
              1
            ),
          }}
        />
      ))}
    </>
  )
}

/** A whole design drawn small, for the version list and the YouTube strip. */
export function ThumbnailPreview({
  design,
  width,
  filterKey,
}: {
  design: ThumbnailDesign
  width: number
  filterKey: string
}) {
  const frame = THUMBNAIL_SIZES[design.shape]
  const scale = width / frame.width
  return (
    <div
      className="relative overflow-hidden"
      style={{
        width,
        height: frame.height * scale,
        backgroundColor: design.backgroundColor,
      }}
    >
      {design.layers
        .filter((layer) => !layer.hidden)
        .sort((a, b) => a.zIndex - b.zIndex)
        .map((layer) => (
          <div
            key={layer.id}
            className="absolute"
            style={{
              left: `${layer.x * 100}%`,
              top: `${layer.y * 100}%`,
              width: `${layer.width * 100}%`,
              height: `${layer.height * 100}%`,
              zIndex: layer.zIndex,
            }}
          >
            <ThumbnailLayerView
              layer={layer}
              shape={design.shape}
              scale={scale}
              filterKey={`${filterKey}-${layer.id}`}
            />
          </div>
        ))}
      <ShapesLayer layers={design.layers} shape={design.shape} />
    </div>
  )
}

/**
 * A whole design as wide as the box it sits in, such as a tile in the
 * Versions card. It measures its box, so the picture always fills it edge to
 * edge whatever width the panel is dragged to.
 */
export function FittedPreview({
  design,
  filterKey,
}: {
  design: ThumbnailDesign
  filterKey: string
}) {
  const ref = React.useRef<HTMLDivElement>(null)
  const [width, setWidth] = React.useState(0)
  React.useLayoutEffect(() => {
    const node = ref.current
    if (!node) return
    const measure = () => setWidth(node.clientWidth)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    return () => observer.disconnect()
  }, [])
  const frame = THUMBNAIL_SIZES[design.shape]
  return (
    <div ref={ref} className="w-full" style={{ aspectRatio: `${frame.width} / ${frame.height}` }}>
      {width > 0 ? <ThumbnailPreview design={design} width={width} filterKey={filterKey} /> : null}
    </div>
  )
}

