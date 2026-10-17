import * as React from "react"
import { CheckCircle2Icon } from "lucide-react"

import { PublicPageFrame } from "@/components/shell/public-page-frame"
import { signInFrameLoader } from "@/lib/app-options"

// Declared once, here, and only loaded when first drawn: the function inside
// runs on first render, not at import. That matters because the options
// module and this file sit in one import circle, so the option may not be
// read while modules are still loading.
const AppFrame = React.lazy(() => {
  const load = signInFrameLoader()
  if (!load) throw new Error("AuthShell drew the app frame with none set")
  return load()
})

/**
 * Shared frame for every signed-out page: sign in, register, verify, reset.
 * An app may draw its own around the card through `signIn.frame`.
 */
export function AuthShell({
  title,
  description,
  notice,
  footer,
  children,
  onSubmit,
}: {
  title: string
  description?: string
  notice?: string | null
  footer?: React.ReactNode
  children: React.ReactNode
  onSubmit?: (event: React.FormEvent<HTMLFormElement>) => void
}) {
  const body = (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">{title}</h1>
        {description ? (
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      <div className="space-y-4">
        {notice ? (
          <p
            role="status"
            aria-live="polite"
            className="flex items-start gap-2 rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground"
          >
            <CheckCircle2Icon className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <span>{notice}</span>
          </p>
        ) : null}
        {children}
      </div>
      {footer ? (
        <div className="mt-6 space-y-1 text-sm text-muted-foreground">
          {footer}
        </div>
      ) : null}
    </>
  )

  const card = onSubmit ? (
    <form
      onSubmit={onSubmit}
      className="w-full max-w-sm rounded-xl border bg-card p-6 shadow-sm"
    >
      {body}
    </form>
  ) : (
    <div className="w-full max-w-sm rounded-xl border bg-card p-6 shadow-sm">
      {body}
    </div>
  )

  if (!signInFrameLoader()) return <PublicPageFrame>{card}</PublicPageFrame>
  // Nothing rather than the public frame while the app's loads, so the page
  // never flashes the look it is about to replace.
  return (
    <React.Suspense fallback={null}>
      <AppFrame>{card}</AppFrame>
    </React.Suspense>
  )
}

export const authLinkClassName =
  "font-medium text-foreground underline-offset-4 hover:underline"
