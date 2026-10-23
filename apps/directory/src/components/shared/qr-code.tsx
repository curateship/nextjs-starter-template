import * as React from "react"
import { encode } from "uqr"

/**
 * A QR code of a short address, drawn as one SVG path of squares.
 *
 * **The colours are written out, not read from the theme.** A scanner needs
 * real black on real white, and a code drawn in theme colours goes pale the
 * moment somebody switches to dark mode, which is exactly when a phone at a
 * counter is dimmest. This is the same deliberate exception the map's deal
 * marker takes in `lib/directory/listing-map.ts`.
 *
 * `uqr` does the encoding and hands back a grid of dark and light squares.
 * Error correction level M means about one square in seven can be covered by
 * a thumb or a reflection and the code still reads. The four-square border is
 * the quiet zone the standard asks for; without it many scanners refuse.
 */
export function QrCode({
  value,
  title,
  className,
}: {
  /** What a scanner gets back, which is a full address. */
  value: string
  /** Read out by a screen reader in place of the drawing. */
  title: string
  className?: string
}) {
  const { size, path } = React.useMemo(() => {
    const qr = encode(value, { ecc: "M", border: 4 })
    const squares: string[] = []
    for (let y = 0; y < qr.size; y++) {
      for (let x = 0; x < qr.size; x++) {
        if (qr.data[y][x]) squares.push(`M${x} ${y}h1v1h-1z`)
      }
    }
    return { size: qr.size, path: squares.join("") }
  }, [value])

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={title}
      shapeRendering="crispEdges"
      className={className}
    >
      <rect width={size} height={size} fill="#ffffff" />
      <path d={path} fill="#000000" />
    </svg>
  )
}
