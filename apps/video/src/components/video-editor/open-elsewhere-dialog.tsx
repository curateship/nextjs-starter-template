import * as React from "react"

import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import {
  useEditorLock,
  useEditorRuntime,
} from "@/components/video-editor/editor-store"
import { useEditorWindow } from "@/components/video-editor/use-editor-window"
import { formatTimeAgo } from "@/lib/format/format-time"

/**
 * Asked once, as the editor opens, when the project is already being edited in
 * another window: open it here read-only, or edit here anyway.
 *
 * Read-only is the button the dialog leads with, because two windows editing
 * one project is how work gets lost. Closing the dialog any other way means
 * edit anyway, the same as its Cancel button, since the person has been told.
 */
export function OpenElsewhereDialog() {
  const { projectId, store } = useEditorRuntime()
  const lock = useEditorLock()
  const firstCheckIn = useEditorWindow(projectId, lock ? "view" : "edit")
  const [answered, setAnswered] = React.useState(false)

  const openedAt = firstCheckIn?.others_editing[0]
  const open = Boolean(openedAt) && !answered && !lock

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setAnswered(true)
      }}
      title="This project is open in another window"
      description={`Another window opened it ${formatTimeAgo(openedAt ?? null).toLowerCase()} and is still editing it. If both windows edit it, the one that saves second stops saving and keeps what it had as a separate project.`}
      destructive={false}
      cancelLabel="Edit here anyway"
      confirmLabel="Open read-only"
      onConfirm={() => {
        setAnswered(true)
        store.setLock("read-only")
      }}
    />
  )
}
