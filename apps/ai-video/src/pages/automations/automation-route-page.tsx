import * as React from "react"
import { Link, useParams } from "@tanstack/react-router"
import { AlertCircleIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { AutomationEditor } from "@/components/automations/automation-editor"
import {
  getAutomationEditorData,
  getAutomationErrorMessage,
  type AutomationEditorData,
} from "@/lib/api/automations"

type LoadResult =
  | { automationId: string; data: AutomationEditorData }
  | { automationId: string; error: string }

export function AutomationRoutePage() {
  const { automationId } = useParams({
    from: "/_authenticated/admin/automations/$automationId",
  })
  const [result, setResult] = React.useState<LoadResult | null>(null)

  React.useEffect(() => {
    let active = true

    getAutomationEditorData(automationId)
      .then((data) => {
        if (active) setResult({ automationId, data })
      })
      .catch((loadError) => {
        if (active) {
          setResult({
            automationId,
            error: getAutomationErrorMessage(loadError),
          })
        }
      })

    return () => {
      active = false
    }
  }, [automationId])

  const current = result?.automationId === automationId ? result : null

  if (current && "error" in current) {
    return (
      <div className="grid h-full place-items-center p-6">
        <div className="text-center">
          <div
            role="alert"
            className="mb-4 flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            <AlertCircleIcon className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{current.error}</span>
          </div>
          <Button asChild variant="outline">
            <Link to="/admin/automations">Back to automations</Link>
          </Button>
        </div>
      </div>
    )
  }

  if (!current) {
    return null
  }

  // Keyed remount so switching automations resets selection/run state.
  return <AutomationEditor key={automationId} initial={current.data} />
}
