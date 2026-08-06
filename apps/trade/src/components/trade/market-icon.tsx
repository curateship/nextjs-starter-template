import * as React from "react"

/**
 * A market's logo, from wherever its exchange serves it — with the symbol's
 * first letter in a circle when there is no logo or it fails to load, so a
 * new listing without art degrades to something readable instead of a broken
 * image glyph.
 */
export function MarketIcon({
  symbol,
  iconUrl,
}: {
  symbol: string
  iconUrl: string | null
}) {
  const [failed, setFailed] = React.useState(false)

  // One market's missing art must not brand the next market a failure too.
  // Adjusted during render, the way `useLastValue` does: React re-runs
  // immediately without painting between.
  const [lastUrl, setLastUrl] = React.useState(iconUrl)
  if (iconUrl !== lastUrl) {
    setLastUrl(iconUrl)
    setFailed(false)
  }

  if (!iconUrl || failed) {
    return (
      <span
        className="flex size-4 shrink-0 items-center justify-center rounded-full bg-muted text-[9px] font-bold text-muted-foreground"
        aria-hidden
      >
        {symbol.slice(0, 1)}
      </span>
    )
  }

  return (
    <img
      src={iconUrl}
      alt=""
      className="size-4 shrink-0 rounded-full"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  )
}
