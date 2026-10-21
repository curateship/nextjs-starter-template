import * as React from "react"

import type {
  CarouselFormat,
  CarouselGradientShadowItem,
  CarouselMediaItem,
  CarouselSlide,
  CarouselSlideItem,
  CarouselTextMark,
  CarouselWordsItem,
} from "@/lib/video/carousel-schema"
import { CAROUSEL_FRAME_SIZES } from "@/lib/video/carousel-layout"
import {
  BOLD_STROKE_EM,
  DEFAULT_HIGHLIGHT_COLOR,
  HIGHLIGHT_SPREAD_EM,
  letterSpacingOf,
  lineHeightOf,
  markRuns,
  slideNumberText,
} from "@/lib/video/carousel-text"
import { requireTextFont } from "@/lib/video/text-fonts"
import { cn } from "@/lib/utils"

/** A whole slide drawn to the width it is given. */
export function StaticSlidePreview({
  slide,
  format,
  index,
  count,
  play = false,
}: {
  slide: CarouselSlide
  format: CarouselFormat
  index: number
  count: number
  play?: boolean
}) {
  const ref = React.useRef<HTMLDivElement>(null)
  const [width, setWidth] = React.useState(0)

  React.useEffect(() => {
    const node = ref.current
    if (!node) return
    const observer = new ResizeObserver(() => setWidth(node.clientWidth))
    observer.observe(node)
    setWidth(node.clientWidth)
    return () => observer.disconnect()
  }, [])

  // Scale text by the preview's real pixel width — identical to the 1080px
  // canvas (which uses fontSize * width/1080) so previews match exactly.
  const scale = width / 1080

  return (
    <div
      ref={ref}
      className="relative w-full overflow-hidden"
      style={{
        aspectRatio: `${CAROUSEL_FRAME_SIZES[format].width} / ${CAROUSEL_FRAME_SIZES[format].height}`,
        backgroundColor: slide.backgroundColor,
      }}
    >
      {slide.items
        .filter((item) => !item.hidden)
        .sort((a, b) => a.zIndex - b.zIndex)
        .map((item) => (
          <div
            key={item.id}
            className="absolute"
            style={{
              left: `${item.x * 100}%`,
              top: `${item.y * 100}%`,
              width: `${item.width * 100}%`,
              height: `${item.height * 100}%`,
              zIndex: item.zIndex,
            }}
          >
            <SlideLayerContent
              item={item}
              scale={scale}
              slideIndex={index}
              slideCount={count}
              play={play}
            />
          </div>
        ))}
    </div>
  )
}

/**
 * What one carousel layer shows, drawn the way the export draws it, at
 * `scale` screen pixels to a full-size pixel. The canvas, the slide
 * thumbnails and the preview all draw layers through this.
 */
export function SlideLayerContent({
  item,
  scale,
  slideIndex,
  slideCount,
  rounded = false,
  play = false,
}: {
  item: CarouselSlideItem
  scale: number
  slideIndex: number
  slideCount: number
  rounded?: boolean
  /** Clips play; false shows their first frame, for thumbnails. */
  play?: boolean
}) {
  if (item.type === "text") {
    return <WordsLayer item={item} text={item.text} marks={item.marks} scale={scale} />
  }
  if (item.type === "slide-number") {
    return (
      <WordsLayer
        item={item}
        text={slideNumberText(slideIndex, slideCount)}
        scale={scale}
      />
    )
  }
  if (item.type === "gradient-shadow") {
    return (
      <div
        className={cn("h-full w-full", rounded && "rounded-sm")}
        style={{ background: gradientShadowBackground(item) }}
      />
    )
  }
  if (item.type === "image") {
    return (
      <img
        src={item.url}
        alt={item.altText ?? ""}
        draggable={false}
        className={cn("h-full w-full", rounded && "rounded-sm")}
        style={pictureStyle(item)}
      />
    )
  }
  // A clip plays muted and loops where it is meant to move: the canvas and
  // the preview. A thumbnail shows its first frame and stays still.
  return (
    <video
      src={play ? item.url : `${item.url}#t=0.1`}
      muted
      playsInline
      loop={play}
      autoPlay={play}
      preload={play ? "auto" : "metadata"}
      aria-label={item.altText || "Video"}
      className={cn("h-full w-full bg-black", rounded && "rounded-sm")}
      style={pictureStyle(item)}
    />
  )
}

/** Fill and Crop cover the box at the picture's focus; Fit shows it whole. */
function pictureStyle(
  item: Pick<CarouselMediaItem, "fit" | "focusX" | "focusY">
): React.CSSProperties {
  if (item.fit === "contain") return { objectFit: "contain" }
  return {
    objectFit: "cover",
    objectPosition: `${(item.focusX ?? 0.5) * 100}% ${(item.focusY ?? 0.5) * 100}%`,
  }
}

/**
 * Words drawn in up to three passes, bottom first, as the export does: the
 * boxes behind highlighted words, then the outline round every letter, then
 * the letters themselves with bold drawn as a line in their own colour. Each
 * pass lays the same words out the same way, so they line up.
 */
function WordsLayer({
  item,
  text,
  marks,
  scale,
}: {
  item: CarouselWordsItem
  text: string
  marks?: CarouselTextMark[]
  scale: number
}) {
  const font = requireTextFont(item.fontId)
  const fontSize = item.fontSize * scale
  const runs = markRuns(text, marks)
  const highlightColor =
    item.type === "text" ? (item.highlightColor ?? DEFAULT_HIGHLIGHT_COLOR) : ""
  const outline =
    item.outlineColor && item.outlineWidth ? item.outlineWidth * 2 * scale : 0
  const bold = BOLD_STROKE_EM * fontSize
  const spread = HIGHLIGHT_SPREAD_EM * fontSize
  const hasHighlight = runs.some((run) => run.highlight)

  const passStyle: React.CSSProperties = {
    fontFamily: font.family,
    fontSize,
    fontWeight: font.weight,
    lineHeight: lineHeightOf(item),
    letterSpacing: `${letterSpacingOf(item)}em`,
    textAlign: item.align,
    whiteSpace: "pre-wrap",
    overflowWrap: "break-word",
  }

  function pass(kind: "highlight" | "outline" | "fill", over: boolean) {
    return (
      <div
        aria-hidden={kind !== "fill"}
        className={over ? "absolute inset-0" : undefined}
        style={{
          ...passStyle,
          color:
            kind === "fill"
              ? item.color
              : kind === "outline"
                ? item.outlineColor
                : "transparent",
        }}
      >
        {runs.map((run, index) => {
          const style: React.CSSProperties = {}
          if (kind === "highlight" && run.highlight) {
            style.backgroundColor = highlightColor
            style.boxShadow = `0 0 0 ${spread}px ${highlightColor}`
            style.boxDecorationBreak = "clone"
            style.WebkitBoxDecorationBreak = "clone"
          }
          const stroke =
            kind === "outline"
              ? outline + (run.bold ? bold : 0)
              : kind === "fill" && run.bold
                ? bold
                : 0
          if (stroke) {
            style.WebkitTextStroke = `${stroke}px ${kind === "outline" ? item.outlineColor : item.color}`
            style.paintOrder = "stroke fill"
          }
          return (
            <span key={index} style={style}>
              {run.text}
            </span>
          )
        })}
      </div>
    )
  }

  return (
    <div
      className="relative h-full w-full"
      style={{ backgroundColor: item.boxColor }}
    >
      {hasHighlight ? pass("highlight", false) : null}
      {outline ? pass("outline", hasHighlight) : null}
      {pass("fill", hasHighlight || Boolean(outline))}
    </div>
  )
}

function gradientShadowBackground(item: CarouselGradientShadowItem) {
  const strong = hexToRgba(item.color, item.opacity / 100)
  const clear = hexToRgba(item.color, 0)
  switch (item.direction ?? "up") {
    case "down":
      return `linear-gradient(to bottom, ${strong} 0%, ${clear} 100%)`
    case "left":
      return `linear-gradient(to left, ${strong} 0%, ${clear} 100%)`
    case "right":
      return `linear-gradient(to right, ${strong} 0%, ${clear} 100%)`
    case "radial":
      return `radial-gradient(circle at 50% 50%, ${clear} 0%, ${strong} 100%)`
    case "solid":
      return strong
    case "up":
    default:
      return `linear-gradient(to top, ${strong} 0%, ${clear} 100%)`
  }
}

function hexToRgba(hex: string, alpha: number) {
  const color = hex.replace("#", "")
  const red = Number.parseInt(color.slice(0, 2), 16)
  const green = Number.parseInt(color.slice(2, 4), 16)
  const blue = Number.parseInt(color.slice(4, 6), 16)

  return `rgba(${red}, ${green}, ${blue}, ${alpha})`
}
