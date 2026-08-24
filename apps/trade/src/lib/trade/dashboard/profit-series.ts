import type { TradingOverviewPoint } from "./overview"

export type TradingOverviewProfitSeries = {
  key: string
  points: TradingOverviewPoint[]
}

export type TradingOverviewProfitChartPoint = { at: number } & Record<
  string,
  number
>

function lastPointAtOrBefore(
  data: readonly TradingOverviewProfitChartPoint[],
  at: number
): TradingOverviewProfitChartPoint | undefined {
  for (let index = data.length - 1; index >= 0; index -= 1) {
    if (data[index].at <= at) return data[index]
  }
  return undefined
}

/** Carries each wallet's latest result across the other wallets' fill times. */
export function mergeTradingOverviewProfitSeries(
  series: TradingOverviewProfitSeries[]
): TradingOverviewProfitChartPoint[] {
  const times = [
    ...new Set(series.flatMap((one) => one.points.map((point) => point.at))),
  ].sort((left, right) => left - right)
  const indexes = series.map(() => 0)

  return times.map((at) => {
    const row: TradingOverviewProfitChartPoint = { at }
    series.forEach((one, seriesIndex) => {
      while (
        indexes[seriesIndex] + 1 < one.points.length &&
        one.points[indexes[seriesIndex] + 1].at <= at
      ) {
        indexes[seriesIndex] += 1
      }
      const point = one.points[indexes[seriesIndex]]
      if (point && point.at <= at) row[one.key] = point.money
    })
    return row
  })
}

/** Crops a stepped chart while carrying its last known values to both edges. */
export function filterTradingOverviewProfitSeries(
  data: readonly TradingOverviewProfitChartPoint[],
  from: number,
  to: number
): TradingOverviewProfitChartPoint[] {
  if (data.length === 0 || from > to) return []
  const rangeFrom = Math.max(from, data[0].at)
  const rangeTo = Math.min(to, data[data.length - 1].at)
  if (rangeFrom > rangeTo) return []

  const first = data.findIndex((point) => point.at >= rangeFrom)
  const lastBeforeFrom = lastPointAtOrBefore(data, rangeFrom)
  const within = data.filter(
    (point) => point.at >= rangeFrom && point.at <= rangeTo
  )

  if (first === -1 || data[first].at > rangeTo) {
    const carried = lastPointAtOrBefore(data, rangeTo)
    return carried
      ? [
          { ...carried, at: rangeFrom },
          { ...carried, at: rangeTo },
        ]
      : []
  }

  const result = [...within]
  if (lastBeforeFrom && result[0]?.at !== rangeFrom) {
    result.unshift({ ...lastBeforeFrom, at: rangeFrom })
  }

  const lastBeforeTo = lastPointAtOrBefore(data, rangeTo)
  if (lastBeforeTo && result.at(-1)?.at !== rangeTo) {
    result.push({ ...lastBeforeTo, at: rangeTo })
  }
  return result
}
