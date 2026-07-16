"use client"

import dynamic from "@/lib/dynamic"

const Toaster = dynamic(
  () => import("@/components/ui/sonner").then(m => m.Toaster),
  { ssr: false }
)

export function DeferredScripts() {
  return (
    <>
      <Toaster />
    </>
  )
}
