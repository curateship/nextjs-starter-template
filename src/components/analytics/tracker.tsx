'use client'

import { useEffect, useRef, useCallback } from 'react'
import { usePathname } from 'next/navigation'

interface AnalyticsEvent {
  type: string
  page_path?: string
  referrer?: string
  session_id: string
  event_data?: Record<string, unknown>
  timestamp: string
}

function getSessionId(): string {
  const key = '_a_sid'
  let sid = sessionStorage.getItem(key)
  if (!sid) {
    sid = crypto.randomUUID()
    sessionStorage.setItem(key, sid)
  }
  return sid
}

export function AnalyticsTracker() {
  const pathname = usePathname()
  const queue = useRef<AnalyticsEvent[]>([])
  const flushTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  const sessionId = useRef<string>('')
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

  const track = useCallback((type: string, pagePath?: string, eventData?: Record<string, unknown>) => {
    if (!sessionId.current) return
    queue.current.push({
      type,
      page_path: pagePath || pathname,
      referrer: document.referrer || undefined,
      session_id: sessionId.current,
      event_data: eventData,
      timestamp: new Date().toISOString(),
    })
  }, [pathname])

  // Initialize
  useEffect(() => {
    sessionId.current = getSessionId()

    // Flush every 5 seconds
    flushTimer.current = setInterval(flush, 5000)

    // Flush on tab hide/close
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        flush()
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)

    // Click tracking via event delegation
    const handleClick = (e: MouseEvent) => {
      if (window.location.pathname.startsWith('/admin')) return
      const target = e.target as HTMLElement
      const anchor = target.closest('a')
      const button = target.closest('button')
      const el = anchor || button
      if (!el) return

      track('click', undefined, {
        element_type: anchor ? 'link' : 'button',
        text: el.textContent?.slice(0, 100) || '',
        href: anchor?.href || undefined,
      })
    }
    document.addEventListener('click', handleClick, { capture: true })

    return () => {
      flush()
      if (flushTimer.current) clearInterval(flushTimer.current)
      document.removeEventListener('visibilitychange', handleVisibility)
      document.removeEventListener('click', handleClick, true)
    }
  }, [flush, track])

  // Track pageviews on route change (skip admin pages)
  useEffect(() => {
    if (!sessionId.current) return
    if (pathname === lastPath.current) return
    if (pathname.startsWith('/admin')) return
    lastPath.current = pathname
    track('pageview', pathname + window.location.search)
  }, [pathname, track])

  return null
}
