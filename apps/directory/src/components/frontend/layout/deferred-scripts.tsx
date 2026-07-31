"use client"

import dynamic from "@/lib/dynamic"
import { useDismissErrorToastOnNavigate } from "@/lib/error-toast"

const Toaster = dynamic(
  () => import("@/components/ui/sonner").then(m => m.Toaster),
  { ssr: false }
)

export function DeferredScripts() {
  useDismissErrorToastOnNavigate()

  return (
    <>
      <Toaster />
    </>
  )
}
