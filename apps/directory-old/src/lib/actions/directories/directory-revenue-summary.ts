// Pure aggregation helpers for the directory monetization revenue summary.
// Kept free of 'server-only' so they stay unit-testable (see directory-revenue-summary.test.ts).

export const REVENUE_CHART_MONTHS = 12
export const EXPIRING_SOON_DAYS = 30

export interface DirectoryRevenueMonthlyRow {
  month: string // 'YYYY-MM'
  currency: string | null
  revenue: number
  purchases: number
}

export interface DirectoryRevenueTotalRow {
  currency: string | null
  revenue: number
  purchases: number
}

export interface DirectoryRevenueMonthPoint {
  month: string // 'YYYY-MM'
  label: string // 'Jul 2026'
  revenue: number
  purchases: number
}

export interface DirectoryRevenueCurrencySummary {
  currency: string
  totalRevenue: number
  totalPurchases: number
  months: DirectoryRevenueMonthPoint[]
}

const monthLabelFormatter = new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' })

export function normalizeRevenueCurrency(currency: string | null | undefined) {
  const trimmed = typeof currency === 'string' ? currency.trim().toLowerCase() : ''
  return trimmed || 'usd'
}

/** First day (UTC) of the oldest month shown on the revenue chart. */
export function revenueChartWindowStart(now: Date) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (REVENUE_CHART_MONTHS - 1), 1))
}

function listChartMonths(now: Date) {
  const months: Array<{ month: string; label: string }> = []
  for (let offset = REVENUE_CHART_MONTHS - 1; offset >= 0; offset--) {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - offset, 1))
    months.push({
      month: `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`,
      label: monthLabelFormatter.format(date),
    })
  }
  return months
}

/**
 * Merge the windowed monthly rows and all-time totals into one zero-filled
 * chart series per currency, largest earner first. Currencies are merged
 * case-insensitively; missing currencies count as USD (Stripe's default).
 */
export function buildDirectoryRevenueCurrencySummaries(input: {
  monthlyRows: DirectoryRevenueMonthlyRow[]
  totalRows: DirectoryRevenueTotalRow[]
  now: Date
}): DirectoryRevenueCurrencySummary[] {
  const chartMonths = listChartMonths(input.now)
  const summaries = new Map<string, DirectoryRevenueCurrencySummary>()

  const getSummary = (currency: string | null | undefined) => {
    const normalized = normalizeRevenueCurrency(currency)
    let summary = summaries.get(normalized)
    if (!summary) {
      summary = {
        currency: normalized,
        totalRevenue: 0,
        totalPurchases: 0,
        months: chartMonths.map((month) => ({ ...month, revenue: 0, purchases: 0 })),
      }
      summaries.set(normalized, summary)
    }
    return summary
  }

  for (const row of input.totalRows) {
    const summary = getSummary(row.currency)
    summary.totalRevenue += row.revenue
    summary.totalPurchases += row.purchases
  }

  for (const row of input.monthlyRows) {
    const point = getSummary(row.currency).months.find((month) => month.month === row.month)
    if (!point) continue // row outside the chart window (app/database clock skew)
    point.revenue += row.revenue
    point.purchases += row.purchases
  }

  return [...summaries.values()].sort((a, b) => b.totalRevenue - a.totalRevenue)
}
