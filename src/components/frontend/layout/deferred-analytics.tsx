"use client"

import dynamic from "next/dynamic"

const Analytics = dynamic(
  () => import("@vercel/analytics/react").then(m => m.Analytics),
  { ssr: false }
)
const SpeedInsights = dynamic(
  () => import("@vercel/speed-insights/next").then(m => m.SpeedInsights),
  { ssr: false }
)

export function DeferredAnalytics() {
  return (
    <>
      <Analytics />
      <SpeedInsights />
    </>
  )
}
