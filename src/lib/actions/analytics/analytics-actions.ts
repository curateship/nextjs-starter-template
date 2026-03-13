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

  // Total pageviews
  const { count: pageViews } = await supabaseAdmin
    .from('analytics_events')
    .select('*', { count: 'exact', head: true })
    .eq('site_id', siteId)
    .eq('event_type', 'pageview')
    .gte('created_at', from)
    .lte('created_at', to)

  // Unique visitors (distinct visitor_hash)
  const { data: visitorData } = await supabaseAdmin
    .from('analytics_events')
    .select('visitor_hash')
    .eq('site_id', siteId)
    .eq('event_type', 'pageview')
    .gte('created_at', from)
    .lte('created_at', to)

  const uniqueVisitors = new Set(visitorData?.map(v => v.visitor_hash)).size

  // Sessions data
  const { data: sessions } = await supabaseAdmin
    .from('analytics_sessions')
    .select('is_bounce, duration_seconds')
    .eq('site_id', siteId)
    .gte('started_at', from)
    .lte('started_at', to)

  const totalSessions = sessions?.length || 0
  const bounces = sessions?.filter(s => s.is_bounce).length || 0
  const bounceRate = totalSessions > 0 ? Math.round((bounces / totalSessions) * 100) : 0
  const avgDuration = totalSessions > 0
    ? Math.round((sessions?.reduce((sum, s) => sum + (s.duration_seconds || 0), 0) || 0) / totalSessions)
    : 0

  return {
    pageViews: pageViews || 0,
    uniqueVisitors,
    bounceRate,
    avgDuration,
  }
}

export async function getTopPages(siteId: string, period: string, limit = 10) {
  const { from, to } = getDateRange(period)

  const { data } = await supabaseAdmin
    .from('analytics_events')
    .select('page_path')
    .eq('site_id', siteId)
    .eq('event_type', 'pageview')
    .gte('created_at', from)
    .lte('created_at', to)

  if (!data?.length) return []

  // Count occurrences
  const counts = new Map<string, number>()
  for (const row of data) {
    if (row.page_path) {
      counts.set(row.page_path, (counts.get(row.page_path) || 0) + 1)
    }
  }

  return Array.from(counts.entries())
    .map(([path, views]) => ({ path, views }))
    .sort((a, b) => b.views - a.views)
    .slice(0, limit)
}

export async function getTopReferrers(siteId: string, period: string, limit = 10) {
  const { from, to } = getDateRange(period)

  const { data } = await supabaseAdmin
    .from('analytics_events')
    .select('referrer_domain')
    .eq('site_id', siteId)
    .eq('event_type', 'pageview')
    .gte('created_at', from)
    .lte('created_at', to)
    .not('referrer_domain', 'is', null)

  if (!data?.length) return []

  const counts = new Map<string, number>()
  for (const row of data) {
    if (row.referrer_domain) {
      counts.set(row.referrer_domain, (counts.get(row.referrer_domain) || 0) + 1)
    }
  }

  return Array.from(counts.entries())
    .map(([domain, visits]) => ({ domain, visits }))
    .sort((a, b) => b.visits - a.visits)
    .slice(0, limit)
}

export async function getTrafficOverTime(siteId: string, period: string) {
  const { from, to } = getDateRange(period)

  const { data } = await supabaseAdmin
    .from('analytics_events')
    .select('created_at, visitor_hash')
    .eq('site_id', siteId)
    .eq('event_type', 'pageview')
    .gte('created_at', from)
    .lte('created_at', to)
    .order('created_at', { ascending: true })

  if (!data?.length) return []

  // Group by day (or hour for today/yesterday)
  const useHourly = period === 'today' || period === 'yesterday'
  const buckets = new Map<string, { views: number; visitors: Set<string> }>()

  for (const row of data) {
    const date = new Date(row.created_at)
    const key = useHourly
      ? `${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} ${date.getHours()}:00`
      : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

    if (!buckets.has(key)) {
      buckets.set(key, { views: 0, visitors: new Set() })
    }
    const bucket = buckets.get(key)!
    bucket.views++
    if (row.visitor_hash) bucket.visitors.add(row.visitor_hash)
  }

  return Array.from(buckets.entries()).map(([date, data]) => ({
    date,
    views: data.views,
    visitors: data.visitors.size,
  }))
}

export async function getUserJourneys(siteId: string, period: string, limit = 10) {
  const { from, to } = getDateRange(period)

  const { data } = await supabaseAdmin
    .from('analytics_sessions')
    .select('entry_page, exit_page, page_count')
    .eq('site_id', siteId)
    .gte('started_at', from)
    .lte('started_at', to)
    .gt('page_count', 1)
    .order('page_count', { ascending: false })
    .limit(50)

  if (!data?.length) return []

  // Group by entry → exit pattern
  const patterns = new Map<string, number>()
  for (const session of data) {
    const key = `${session.entry_page || '/'} → ${session.exit_page || '/'}`
    patterns.set(key, (patterns.get(key) || 0) + 1)
  }

  return Array.from(patterns.entries())
    .map(([path, count]) => ({ path, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit)
}
