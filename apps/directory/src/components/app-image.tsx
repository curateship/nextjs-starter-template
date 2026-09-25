import type { CSSProperties, ImgHTMLAttributes, Ref } from "react"

type ImageSource = string | { src: string; width?: number; height?: number }

// Note: no `quality` or `unoptimized` props. They were carried over from
// next/image and silently discarded — sizing and compression are the CDN's job,
// not this component's.
type AppImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, "src"> & {
  src: ImageSource
  fill?: boolean
  priority?: boolean
  // Lets a caller read the element back — used to spot a picture that already
  // failed before React was running.
  ref?: Ref<HTMLImageElement>
}

export default function AppImage({
  src,
  fill,
  priority,
  style,
  width,
  height,
  ref,
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
      ref={ref}
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
