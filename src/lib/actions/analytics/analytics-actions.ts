'use server'

import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

interface DateRange {
  from: string  // ISO date string
  to: string    // ISO date string
}

function getDateRange(period: string): DateRange {
  const now = new Date()
  const to = new Date(now)
  to.setHours(23, 59, 59, 999)

  const from = new Date(now)
  switch (period) {
    case 'today':
      from.setHours(0, 0, 0, 0)
      break
    case 'yesterday':
      from.setDate(from.getDate() - 1)
      from.setHours(0, 0, 0, 0)
      to.setDate(to.getDate() - 1)
      to.setHours(23, 59, 59, 999)
      break
    case '30d':
      from.setDate(from.getDate() - 30)
      from.setHours(0, 0, 0, 0)
      break
    case '7d':
    default:
      from.setDate(from.getDate() - 7)
      from.setHours(0, 0, 0, 0)
      break
  }

  return { from: from.toISOString(), to: to.toISOString() }
}

export async function getAnalyticsOverview(siteId: string, period: string) {
  const { from, to } = getDateRange(period)

  const { data, error } = await supabaseAdmin.rpc('get_analytics_overview', {
    p_site_id: siteId,
    p_from: from,
    p_to: to,
  })

  if (error) {
    console.error('Failed to get analytics overview:', error)
    return { pageViews: 0, uniqueVisitors: 0, bounceRate: 0, avgDuration: 0 }
  }

  return data as { pageViews: number; uniqueVisitors: number; bounceRate: number; avgDuration: number }
}

export async function getTopPages(siteId: string, period: string, limit = 10) {
  const { from, to } = getDateRange(period)

  const { data, error } = await supabaseAdmin.rpc('get_top_pages', {
    p_site_id: siteId,
    p_from: from,
    p_to: to,
    p_limit: limit,
  })

  if (error) {
    console.error('Failed to get top pages:', error)
    return []
  }

  return (data as { path: string; views: number }[]) || []
}

export async function getTopReferrers(siteId: string, period: string, limit = 10) {
  const { from, to } = getDateRange(period)

  const { data, error } = await supabaseAdmin.rpc('get_top_referrers', {
    p_site_id: siteId,
    p_from: from,
    p_to: to,
    p_limit: limit,
  })

  if (error) {
    console.error('Failed to get top referrers:', error)
    return []
  }

  return (data as { domain: string; visits: number }[]) || []
}

export async function getTrafficOverTime(siteId: string, period: string) {
  const { from, to } = getDateRange(period)
  const useHourly = period === 'today' || period === 'yesterday'

  const { data, error } = await supabaseAdmin.rpc('get_traffic_over_time', {
    p_site_id: siteId,
    p_from: from,
    p_to: to,
    p_hourly: useHourly,
  })

  if (error) {
    console.error('Failed to get traffic over time:', error)
    return []
  }

  return (data as { date: string; views: number; visitors: number }[]) || []
}

export async function getUserJourneys(siteId: string, period: string, limit = 10) {
  const { from, to } = getDateRange(period)

  const { data, error } = await supabaseAdmin.rpc('get_user_journeys', {
    p_site_id: siteId,
    p_from: from,
    p_to: to,
    p_limit: limit,
  })

  if (error) {
    console.error('Failed to get user journeys:', error)
    return []
  }

  return (data as { path: string; count: number }[]) || []
}

/**
 * Lightweight site fetch for dashboard — skips auth since admin layout already verified.
 * Only fetches fields needed for display.
 */
export async function getSiteForDashboard(siteId: string) {
  const { data } = await supabaseAdmin
    .from('sites')
    .select('id, name, subdomain')
    .eq('id', siteId)
    .single()

  return data as { id: string; name: string; subdomain: string } | null
}
