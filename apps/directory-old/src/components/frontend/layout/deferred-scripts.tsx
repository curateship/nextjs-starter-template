"use client"

import * as React from "react"

import dynamic from "@/lib/dynamic"
import { useDismissErrorToastOnNavigate } from "@/lib/error-toast"
import { setToastSeconds } from "@/lib/toast-duration"

const Toaster = dynamic(
  () => import("@/components/ui/sonner").then(m => m.Toaster),
  { ssr: false }
)

export function DeferredScripts({ toastSeconds }: { toastSeconds?: number }) {
  useDismissErrorToastOnNavigate()

  // The Toaster is mounted here, outside the admin shell, so it can't read the
  // saved setting itself — publish it to the store the Toaster subscribes to.
  // See lib/toast-duration.ts. Undefined leaves the default in place.
  React.useEffect(() => {
    if (toastSeconds !== undefined) setToastSeconds(toastSeconds)
  }, [toastSeconds])

  return (
    <>
      <Toaster />
    </>
  )
}
