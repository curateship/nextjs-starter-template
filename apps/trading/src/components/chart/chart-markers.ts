import type { SeriesMarker, Time, UTCTimestamp } from "lightweight-charts"

export const CHART_UP_COLOR = "#089981"
export const CHART_DOWN_COLOR = "#f23645"

export type ChartMarker = {
  /** Marker time, in milliseconds since the epoch. */
  time: number
  side: "buy" | "sell"
  /** Green = long, red = short, yellow = flip unless explicitly overridden. */
  color?: string
  /** Letter color; defaults to white. Used to keep the flip "F" legible. */
  textColor?: string
  /** Exact fill or signal price. */
  price: number
  /** O/C/F renders a fill chip; no letter renders a native signal arrow. */
  letter?: "O" | "C" | "F"
}

export function toNativeSignalMarkers(
  markers: ChartMarker[]
): SeriesMarker<Time>[] {
  return markers
    .filter((marker) => !marker.letter)
    .sort((a, b) => a.time - b.time)
    .map((marker, index) => ({
      // Index keeps the id unique: a DCA ladder fills several rungs inside one
      // candle, so every buy shares a time and side. A shared id would make the
      // chart dedupe them to a single arrow (the bunched-at-the-bottom look);
      // a unique id lets all rungs draw, each at its own fill price.
      id: `signal:${marker.time}:${marker.side}:${index}`,
      time: Math.floor(marker.time / 1000) as UTCTimestamp,
      position: marker.side === "buy" ? "atPriceBottom" : "atPriceTop",
      price: marker.price,
      shape: marker.side === "buy" ? "arrowUp" : "arrowDown",
      size: 2,
      color:
        marker.color ??
        (marker.side === "buy" ? CHART_UP_COLOR : CHART_DOWN_COLOR),
    }))
}
