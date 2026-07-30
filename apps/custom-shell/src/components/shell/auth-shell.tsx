import * as React from "react"
import { CheckCircle2Icon } from "lucide-react"

import { PublicPageFrame } from "@/components/shell/public-page-frame"

/** Shared frame for every signed-out page: sign in, register, verify, reset. */
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
        <h1 className="text-xl font-semibold">{title}</h1>
        {description ? (
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      <div className="space-y-4">
        {notice ? (
          <p
            role="status"
            aria-live="polite"
            className="flex items-start gap-2 text-sm text-muted-foreground"
          >
            <CheckCircle2Icon className="mt-0.5 h-4 w-4 shrink-0" />
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

  return (
    <PublicPageFrame>
      {onSubmit ? (
        <form
          onSubmit={onSubmit}
          className="w-full max-w-sm rounded-xl border border-foreground/5 bg-card p-6 shadow-sm"
        >
          {body}
        </form>
      ) : (
        <div className="w-full max-w-sm rounded-xl border border-foreground/5 bg-card p-6 shadow-sm">
          {body}
        </div>
      )}
    </PublicPageFrame>
  )
}

export const authLinkClassName =
  "font-medium text-foreground underline-offset-4 hover:underline"
