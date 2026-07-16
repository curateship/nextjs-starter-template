import type { CSSProperties, ImgHTMLAttributes } from "react"

type ImageSource = string | { src: string; width?: number; height?: number }

type AppImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, "src"> & {
  src: ImageSource
  fill?: boolean
  priority?: boolean
  quality?: number
  unoptimized?: boolean
}

export default function AppImage({
  src,
  fill,
  priority,
  quality: _quality,
  unoptimized: _unoptimized,
  style,
  width,
  height,
  ...props
}: AppImageProps) {
  const resolved = typeof src === "string" ? src : src.src
  const resolvedWidth = width ?? (typeof src === "string" ? undefined : src.width)
  const resolvedHeight = height ?? (typeof src === "string" ? undefined : src.height)
  const fillStyle: CSSProperties | undefined = fill
    ? { position: "absolute", inset: 0, width: "100%", height: "100%", ...style }
    : style

  return (
    <img
      src={resolved}
      width={resolvedWidth}
      height={resolvedHeight}
      loading={priority ? "eager" : props.loading || "lazy"}
      fetchPriority={priority ? "high" : props.fetchPriority}
      style={fillStyle}
      {...props}
    />
  )
}
