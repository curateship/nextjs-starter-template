import * as React from "react"

import { CollapsibleSettingsCard } from "@/components/settings/collapsible-settings-card"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  collapseStorageKey,
  useRememberedCollapse,
} from "@/lib/remembered-choice"

/**
 * One card in a Project settings window, the editor's and a Viral project's.
 * In the settings window it folds from its header, and this browser
 * remembers which cards were left shut (Tyler, 20 Oct 2026: "Project setting
 * cog modal cards should be collapsible"). The New project window keeps every
 * card open, so a card shut in settings never hides a field a new project
 * needs.
 *
 * `show` opens a shut card while a field in it is marked wrong, so the field
 * the error toast names is always in view.
 */
export function SettingsFoldCard({
  fold,
  storageId,
  title,
  description,
  show = false,
  contentClassName = "grid gap-4",
  children,
}: {
  /** False in the New project window: a plain card, always open. */
  fold: boolean
  storageId: string
  title: string
  description?: React.ReactNode
  show?: boolean
  contentClassName?: string
  children: React.ReactNode
}) {
  const [open, setOpen, noFlashKey] = useRememberedCollapse(
    collapseStorageKey.settingsCard(storageId)
  )

  if (!fold) {
    return (
      <Card size="sm">
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          {description ? <CardDescription>{description}</CardDescription> : null}
        </CardHeader>
        <CardContent className={contentClassName}>{children}</CardContent>
      </Card>
    )
  }

  return (
    <CollapsibleSettingsCard
      size="sm"
      storageId={storageId}
      title={title}
      description={description}
      contentClassName={contentClassName}
      collapse={{ open: open || show, onOpenChange: setOpen, noFlashKey }}
    >
      {children}
    </CollapsibleSettingsCard>
  )
}
