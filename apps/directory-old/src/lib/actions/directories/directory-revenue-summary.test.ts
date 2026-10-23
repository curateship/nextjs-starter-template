import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  buildDirectoryRevenueCurrencySummaries,
  normalizeRevenueCurrency,
  REVENUE_CHART_MONTHS,
  revenueChartWindowStart,
} from './directory-revenue-summary'

const NOW = new Date('2026-07-16T10:00:00.000Z')

describe('normalizeRevenueCurrency', () => {
  it('lowercases currencies and falls back to usd', () => {
    assert.equal(normalizeRevenueCurrency('USD'), 'usd')
    assert.equal(normalizeRevenueCurrency(' EUR '), 'eur')
    assert.equal(normalizeRevenueCurrency(null), 'usd')
    assert.equal(normalizeRevenueCurrency(''), 'usd')
  })
})

describe('revenueChartWindowStart', () => {
  it('returns the first day of the oldest charted month', () => {
    assert.equal(revenueChartWindowStart(NOW).toISOString(), '2025-08-01T00:00:00.000Z')
  })

  it('handles windows crossing a year boundary', () => {
    assert.equal(revenueChartWindowStart(new Date('2026-01-05T00:00:00.000Z')).toISOString(), '2025-02-01T00:00:00.000Z')
  })
})

describe('buildDirectoryRevenueCurrencySummaries', () => {
  it('zero-fills every chart month and ends at the current month', () => {
    const [summary] = buildDirectoryRevenueCurrencySummaries({
      monthlyRows: [{ month: '2026-05', currency: 'usd', revenue: 4900, purchases: 1 }],
      totalRows: [{ currency: 'usd', revenue: 4900, purchases: 1 }],
      now: NOW,
    })

    assert.equal(summary.months.length, REVENUE_CHART_MONTHS)
    assert.equal(summary.months[0].month, '2025-08')
    assert.equal(summary.months[REVENUE_CHART_MONTHS - 1].month, '2026-07')
    assert.deepEqual(
      summary.months.find((month) => month.month === '2026-05'),
      { month: '2026-05', label: 'May 2026', revenue: 4900, purchases: 1 }
    )
    assert.equal(summary.months.filter((month) => month.revenue === 0).length, REVENUE_CHART_MONTHS - 1)
  })

  it('merges currencies case-insensitively and treats missing currency as usd', () => {
    const summaries = buildDirectoryRevenueCurrencySummaries({
      monthlyRows: [
        { month: '2026-07', currency: 'USD', revenue: 1000, purchases: 1 },
        { month: '2026-07', currency: 'usd', revenue: 500, purchases: 1 },
        { month: '2026-07', currency: null, revenue: 250, purchases: 1 },
      ],
      totalRows: [
        { currency: 'USD', revenue: 1000, purchases: 1 },
        { currency: 'usd', revenue: 500, purchases: 1 },
        { currency: null, revenue: 250, purchases: 1 },
      ],
      now: NOW,
    })

    assert.equal(summaries.length, 1)
    assert.equal(summaries[0].currency, 'usd')
    assert.equal(summaries[0].totalRevenue, 1750)
    assert.equal(summaries[0].totalPurchases, 3)
    assert.equal(summaries[0].months.at(-1)?.revenue, 1750)
    assert.equal(summaries[0].months.at(-1)?.purchases, 3)
  })

  it('sorts currencies by all-time revenue, largest first', () => {
    const summaries = buildDirectoryRevenueCurrencySummaries({
      monthlyRows: [],
      totalRows: [
        { currency: 'usd', revenue: 100, purchases: 1 },
        { currency: 'eur', revenue: 900, purchases: 2 },
      ],
      now: NOW,
    })

    assert.deepEqual(summaries.map((summary) => summary.currency), ['eur', 'usd'])
  })

  it('keeps all-time totals even when sales fall outside the chart window', () => {
    const [summary] = buildDirectoryRevenueCurrencySummaries({
      monthlyRows: [{ month: '2026-06', currency: 'usd', revenue: 2000, purchases: 2 }],
      totalRows: [{ currency: 'usd', revenue: 9000, purchases: 9 }],
      now: NOW,
    })

    assert.equal(summary.totalRevenue, 9000)
    assert.equal(summary.totalPurchases, 9)
    assert.equal(summary.months.reduce((sum, month) => sum + month.revenue, 0), 2000)
  })

  it('ignores monthly rows outside the chart window instead of crashing', () => {
    const [summary] = buildDirectoryRevenueCurrencySummaries({
      monthlyRows: [{ month: '2024-01', currency: 'usd', revenue: 700, purchases: 1 }],
      totalRows: [{ currency: 'usd', revenue: 700, purchases: 1 }],
      now: NOW,
    })

    assert.equal(summary.months.every((month) => month.revenue === 0), true)
  })
})
