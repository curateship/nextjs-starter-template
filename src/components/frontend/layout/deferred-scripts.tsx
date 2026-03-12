"use client"

import dynamic from "next/dynamic"

const Toaster = dynamic(
  () => import("sonner").then(m => m.Toaster),
  { ssr: false }
)
const Analytics = dynamic(
  () => import("@vercel/analytics/react").then(m => m.Analytics),
  { ssr: false }
)
const SpeedInsights = dynamic(
  () => import("@vercel/speed-insights/next").then(m => m.SpeedInsights),
  { ssr: false }
)

export function DeferredScripts() {
  return (
    <>
      <Toaster />
      <Analytics />
      <SpeedInsights />
    </>
  )
}
