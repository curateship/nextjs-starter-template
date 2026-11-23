import * as React from "react"
import { Loader2Icon } from "lucide-react"

import type { SaveStatus } from "@/components/shell/sticky-header/sticky-header"

import { GuestContext, type PromoGuest } from "./guest-mode"
import { GuestNotice } from "./guest-notice"

/**
 * The frame around a guest's page, sent from Project
 * (`workspace/docs/project-guests.md`): the project's name, who is working
 * it, and the Saving… sign. There is no left menu and no way to another
 * project.
 */
export function GuestFrame({
  projectId,
  projectName,
  guestName,
  children,
}: {
  projectId: string
  projectName: string
  /** The Project person's name; empty when an admin opens the address. */
  guestName: string
  children: React.ReactNode
}) {
  const [saveStatus, setSaveStatus] = React.useState<SaveStatus | null>(null)
  const value = React.useMemo<PromoGuest>(
    () => ({ name: guestName, projectId, reportSaveStatus: setSaveStatus }),
    [guestName, projectId]
  )
  return (
    <div className="flex h-dvh flex-col bg-muted/60">
      <header className="flex h-12 shrink-0 items-center gap-3 border-b bg-sidebar px-4">
        <p className="min-w-0 flex-1 truncate text-sm">
          <span className="font-medium">{projectName}</span>
          {guestName ? <span className="text-muted-foreground"> · Working as {guestName} via Project</span> : null}
        </p>
        {saveStatus === "saving" ? (
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Loader2Icon className="size-3.5 animate-spin" aria-hidden="true" />
            Saving…
          </span>
        ) : saveStatus === "saved" ? (
          <span className="text-xs text-muted-foreground">Saved</span>
        ) : null}
      </header>
      <main className="flex min-h-0 flex-1 flex-col p-2 md:p-3">
        {/* An admin opening this address sees the dashboard as an admin, with nothing hidden. */}
        {guestName ? <GuestContext.Provider value={value}>{children}</GuestContext.Provider> : children}
      </main>
    </div>
  )
}

/** What the guest page shows when the sign-in from Project has run out or was for another project. */
export function GuestProjectError() {
  return (
    <GuestNotice
      title="You are not signed in to this project"
      text="Your sign-in from Project lasts 12 hours, or it was for another project. Open the task in Project again and press Open in Promo."
    />
  )
}
