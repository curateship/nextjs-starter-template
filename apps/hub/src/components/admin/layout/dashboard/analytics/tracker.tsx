'use client'

import { useEffect, useRef, useCallback } from 'react'
import { usePathname } from 'next/navigation'

interface AnalyticsEvent {
  type: string
  page_path?: string
  referrer?: string
  daily_visitor?: boolean
  timestamp: string
}

function shouldCountDailyVisitor(): boolean {
  const day = new Date().toISOString().slice(0, 10)
  const key = `_a_dv:${day}`

  try {
    if (localStorage.getItem(key)) return false
    localStorage.setItem(key, '1')
    return true
  } catch {
    return true
  }
}

export function AnalyticsTracker() {
  const pathname = usePathname()
  const queue = useRef<AnalyticsEvent[]>([])
  const flushTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  const lastPath = useRef<string>('')

  const flush = useCallback(() => {
    if (queue.current.length === 0) return
    const events = [...queue.current]
    queue.current = []
    const body = JSON.stringify({ events })

    if (typeof navigator.sendBeacon === 'function') {
      navigator.sendBeacon('/api/analytics/track', body)
    } else {
      fetch('/api/analytics/track', {
        method: 'POST',
        body,
        headers: { 'Content-Type': 'application/json' },
        keepalive: true,
      }).catch(() => {})
    }
  }, [])

  const trackPageview = useCallback((pagePath: string) => {
    const dailyVisitor = shouldCountDailyVisitor()

    queue.current.push({
      type: 'pageview',
      page_path: pagePath,
      referrer: document.referrer || undefined,
      daily_visitor: dailyVisitor || undefined,
      timestamp: new Date().toISOString(),
    })
  }, [])

  useEffect(() => {
    flushTimer.current = setInterval(flush, 5000)

    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        flush()
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      flush()
      if (flushTimer.current) clearInterval(flushTimer.current)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [flush])

  useEffect(() => {
    if (pathname === lastPath.current) return
    if (pathname.startsWith('/admin')) return
    lastPath.current = pathname
    trackPageview(pathname + window.location.search)
  }, [pathname, trackPageview])

  return null
}
