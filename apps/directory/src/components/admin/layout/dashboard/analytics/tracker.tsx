'use client'

import { useEffect, useRef, useCallback } from 'react'
import { usePathname } from '@/lib/navigation-client'
import { UUID_REGEX } from '@/lib/utils/validation'

interface AnalyticsEvent {
  type: string
  page_path?: string
  referrer?: string
  daily_visitor?: boolean
  timestamp: string
  sponsor_id?: string
  placement?: string
  post_id?: string
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

  // Track rendered sponsor embeds once per page view. Failures never break the page.
  useEffect(() => {
    if (pathname.startsWith('/admin')) return

    const seen = new Set<string>()

    const scan = () => {
      try {
        const cards = document.querySelectorAll<HTMLElement>('[data-sponsor-track="true"][data-sponsor-id]')
        cards.forEach((card) => {
          const sponsorId = card.dataset.sponsorId || ''
          if (!UUID_REGEX.test(sponsorId) || seen.has(sponsorId)) return
          seen.add(sponsorId)

          const postId = card.dataset.sponsorPostId
          queue.current.push({
            type: 'sponsor_impression',
            sponsor_id: sponsorId,
            page_path: pathname,
            placement: card.dataset.sponsorPlacement || 'post_editor',
            post_id: postId && UUID_REGEX.test(postId) ? postId : undefined,
            timestamp: new Date().toISOString(),
          })
        })
      } catch {
        // Never break public rendering because of tracking
      }
    }

    // Scan after paint, then once more for late-hydrating content
    const firstScan = setTimeout(scan, 1000)
    const secondScan = setTimeout(scan, 4000)

    return () => {
      clearTimeout(firstScan)
      clearTimeout(secondScan)
    }
  }, [pathname])

  return null
}
