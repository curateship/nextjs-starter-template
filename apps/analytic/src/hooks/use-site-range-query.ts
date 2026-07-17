import * as React from "react"

import type { OverviewRange } from "@/lib/api/overview"

export type CustomRange = { from: string; to: string }

// Site/range state plus refetching for a report screen. The route loader
// supplies the initial data, so fetches happen in response to the user
// changing the site or range — not via a state-watching effect. A monotonic
// token guards against out-of-order responses when changes race.
export function useSiteRangeQuery<T>({
  initialSiteId,
  initialRange,
  initialCustom,
  initialData,
  load,
  errorMessage,
}: {
  initialSiteId: string
  initialRange: OverviewRange
  initialCustom: CustomRange
  initialData: T
  load: (input: {
    siteId: string
    range: OverviewRange
    from?: string
    to?: string
  }) => Promise<T>
  errorMessage: (error: unknown) => string
}) {
  const [siteId, setSiteId] = React.useState(initialSiteId)
  const [range, setRange] = React.useState<OverviewRange>(initialRange)
  const [custom, setCustom] = React.useState<CustomRange>(initialCustom)
  const [data, setData] = React.useState<T>(initialData)
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const requestSeq = React.useRef(0)

  async function refresh(
    nextSiteId: string,
    nextRange: OverviewRange,
    nextCustom: CustomRange
  ) {
    // Custom needs both dates before it can resolve.
    if (nextRange === "custom" && (!nextCustom.from || !nextCustom.to)) return

    const seq = (requestSeq.current += 1)
    setLoading(true)
    setError(null)
    try {
      const next = await load({
        siteId: nextSiteId,
        range: nextRange,
        from: nextRange === "custom" ? nextCustom.from : undefined,
        to: nextRange === "custom" ? nextCustom.to : undefined,
      })
      if (seq === requestSeq.current) setData(next)
    } catch (err) {
      if (seq === requestSeq.current) setError(errorMessage(err))
    } finally {
      if (seq === requestSeq.current) setLoading(false)
    }
  }

  function selectSite(nextSiteId: string) {
    setSiteId(nextSiteId)
    void refresh(nextSiteId, range, custom)
  }

  function selectRange(nextRange: OverviewRange) {
    setRange(nextRange)
    void refresh(siteId, nextRange, custom)
  }

  function changeCustom(next: CustomRange) {
    setCustom(next)
    void refresh(siteId, "custom", next)
  }

  return {
    siteId,
    range,
    custom,
    data,
    loading,
    error,
    selectSite,
    selectRange,
    changeCustom,
  }
}
