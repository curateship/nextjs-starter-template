import * as React from "react"
import { useRouter } from "@tanstack/react-router"
import { HistoryIcon, InfoIcon, PlayIcon, Trash2Icon } from "lucide-react"

import { MenuActionRow } from "@/components/admin-dashboard/list-parts"
import { EmptyRecord, RecordFrame } from "@/components/crm/record-frame"
import { TabbedMenu } from "@/components/shared/notes/tabbed-menu"
import { PanelCard } from "@/components/shared/panel-card"
import { Button } from "@/components/ui/button"
import { FieldLabel } from "@/components/ui/field-label"
import { Input } from "@/components/ui/input"
import { getFlowErrorMessage, renameFlowRun, type FlowRunListItem } from "@/lib/api/video/flow"
import { formatInboxTime } from "@/lib/crm/inbox-time"
import { showErrorToast } from "@/lib/toast/error-toast"
import { FLOW_NAME_MAX } from "@/lib/video/flow/flows"
import { FLOW_RUN_STATUS_LABELS } from "@/lib/video/flow/run-shape"
import { formatCents } from "@/lib/video/project-spend"

const HIDE_LABEL = "Hide the run"
const SAVE_AFTER_MS = 700

/**
 * The Runs section's right panel: the run whose cog was pressed, as a flow's
 * is on the Flows section (`flow-panel.tsx`).
 *
 * - **Header:** the run's name and its state, then its ⋮ with Delete run.
 * - **Body:** the name, saved 700ms after the last letter (Tyler, 14 Nov
 *   2026: "need ability to edit the run like title"), then what it is.
 * - **Footer:** Open the run, its steps page in the middle.
 */
export function RunPanel({
  run,
  onOpen,
  onDelete,
}: {
  /** Null when there are no runs at all. */
  run: FlowRunListItem | null
  onOpen: (runId: string) => void
  onDelete: (run: FlowRunListItem) => void
}) {
  const [menuOpen, setMenuOpen] = React.useState(false)
  if (!run) {
    return <EmptyRecord title="Run" icon={<HistoryIcon />} line="No runs yet. Run a flow to make the first one." hideLabel={HIDE_LABEL} />
  }
  return (
    <RecordFrame
      avatar={<HistoryIcon aria-hidden />}
      title={run.flowName}
      line={FLOW_RUN_STATUS_LABELS[run.status]}
      hideLabel={HIDE_LABEL}
      actions={
        <TabbedMenu
          label="Run menu"
          align="end"
          width="20.4rem"
          open={menuOpen}
          onOpenChange={setMenuOpen}
          tabs={[
            {
              value: "general",
              label: "General",
              content: (
                <div className="grid p-3">
                  <MenuActionRow
                    icon={<Trash2Icon />}
                    destructive
                    onClick={() => {
                      setMenuOpen(false)
                      onDelete(run)
                    }}
                  >
                    Delete run
                  </MenuActionRow>
                </div>
              ),
            },
          ]}
        />
      }
      body={
        <>
          <PanelCard storageId="video-flow-run-details" icon={<HistoryIcon />} title="The run">
            <RunNameField run={run} />
          </PanelCard>
          <PanelCard storageId="video-flow-run-facts" icon={<InfoIcon />} title="Where it is">
            <div className="grid gap-4">
              <Fact label="Steps">
                {run.stepsDone} of {run.stepCount} done
              </Fact>
              <Fact label="Project">{run.projectName ?? "Not saved yet"}</Fact>
              <Fact label="Spent">{run.spentCents ? formatCents(run.spentCents) : "Nothing yet"}</Fact>
              <Fact label="Started">{formatInboxTime(run.createdAt)}</Fact>
            </div>
          </PanelCard>
        </>
      }
      footer={
        <Button type="button" className="w-full" onClick={() => onOpen(run.id)}>
          <PlayIcon />
          Open the run
        </Button>
      }
    />
  )
}

/** The run's name, saved as it is typed; a blank one keeps the name it had. */
function RunNameField({ run }: { run: Pick<FlowRunListItem, "id" | "flowName"> }) {
  const router = useRouter()
  const [name, setName] = React.useState(run.flowName)
  const timer = React.useRef(0)
  const pending = React.useRef<string | null>(null)

  const flush = React.useCallback(() => {
    window.clearTimeout(timer.current)
    const next = pending.current
    pending.current = null
    if (next === null || !next.trim()) return
    renameFlowRun(run.id, next)
      .then(() => router.invalidate())
      .catch((error: unknown) => showErrorToast(getFlowErrorMessage(error)))
  }, [run.id, router])
  React.useEffect(() => () => flush(), [flush])

  return (
    <div className="grid gap-2">
      <FieldLabel htmlFor={`run-name-${run.id}`} hint="Its bell, its files and the video it saves are named after it.">
        Name
      </FieldLabel>
      <Input
        id={`run-name-${run.id}`}
        value={name}
        maxLength={FLOW_NAME_MAX}
        aria-invalid={!name.trim() || undefined}
        onChange={(event) => {
          setName(event.target.value)
          pending.current = event.target.value
          window.clearTimeout(timer.current)
          timer.current = window.setTimeout(flush, SAVE_AFTER_MS)
        }}
        onBlur={flush}
      />
    </div>
  )
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-0.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm break-words">{children}</span>
    </div>
  )
}
