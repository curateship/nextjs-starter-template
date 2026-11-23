import * as React from "react"
import { useRouter } from "@tanstack/react-router"
import { CopyIcon, InfoIcon, SettingsIcon, Trash2Icon, WorkflowIcon } from "lucide-react"

import { EmptyRecord, RecordFrame } from "@/components/crm/record-frame"
import { MenuActionRow } from "@/components/admin-dashboard/list-parts"
import { PickGroup, PickRow } from "@/components/shared/notes/pick-rows"
import { TabbedMenu } from "@/components/shared/notes/tabbed-menu"
import { PanelCard } from "@/components/shared/panel-card"
import { Button } from "@/components/ui/button"
import { FieldLabel } from "@/components/ui/field-label"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { getFlowErrorMessage, updateFlowDetails, type FlowListItem } from "@/lib/api/video/flow"
import { formatInboxTime } from "@/lib/crm/inbox-time"
import { FLOW_NAME_MAX } from "@/lib/video/flow/flows"
import { showErrorToast } from "@/lib/toast/error-toast"

const HIDE_LABEL = "Hide the flow"
const SAVE_AFTER_MS = 700

/**
 * The Flows section's right panel: the flow picked in the table, as a page
 * is on Admin → Pages (`page-panel.tsx`).
 *
 * - **Header:** the flow's name and how many nodes it has, then its ⋮, the
 *   tabbed menu a page's is: General with the flow's nodes, runs and last
 *   run, then Duplicate and Delete flow.
 * - **Body:** the name and the description, each saved 700ms after the last
 *   letter, and what it has run.
 * - **Footer:** Run, which asks for the project, and Edit flow, which opens
 *   the builder in the middle.
 */
export function FlowPanel({
  flow,
  runButton,
  onEdit,
  onDuplicate,
  onDelete,
}: {
  /** Null when there are no flows at all. */
  flow: FlowListItem | null
  runButton: React.ReactNode
  onEdit: (flowId: string) => void
  onDuplicate: (flowId: string) => void
  onDelete: (flow: FlowListItem) => void
}) {
  const [menuOpen, setMenuOpen] = React.useState(false)
  if (!flow) {
    return <EmptyRecord title="Flow" icon={<WorkflowIcon />} line="No flows yet. New flow makes the first one." hideLabel={HIDE_LABEL} />
  }
  return (
    <RecordFrame
      avatar={<WorkflowIcon aria-hidden />}
      title={flow.name}
      line={flow.nodeCount === 1 ? "1 node" : `${flow.nodeCount} nodes`}
      hideLabel={HIDE_LABEL}
      actions={
        <TabbedMenu
          label="Flow menu"
          align="end"
          width="20.4rem"
          open={menuOpen}
          onOpenChange={setMenuOpen}
          tabs={[
            {
              value: "general",
              label: "General",
              content: (
                <div className="grid gap-4 p-3">
                  <PickGroup title="Flow">
                    <PickRow label="Nodes" value={String(flow.nodeCount)} disabled>
                      {null}
                    </PickRow>
                    <PickRow label="Runs" value={String(flow.runCount)} disabled>
                      {null}
                    </PickRow>
                    <PickRow label="Last run" value={flow.lastRunAt ? formatInboxTime(flow.lastRunAt) : "Never"} disabled>
                      {null}
                    </PickRow>
                  </PickGroup>
                  <div className="grid">
                    <MenuActionRow
                      icon={<CopyIcon />}
                      onClick={() => {
                        setMenuOpen(false)
                        onDuplicate(flow.id)
                      }}
                    >
                      Duplicate
                    </MenuActionRow>
                    <MenuActionRow
                      icon={<Trash2Icon />}
                      destructive
                      onClick={() => {
                        setMenuOpen(false)
                        onDelete(flow)
                      }}
                    >
                      Delete flow
                    </MenuActionRow>
                  </div>
                </div>
              ),
            },
          ]}
        />
      }
      body={
        <>
          <PanelCard storageId="video-flow-details" icon={<WorkflowIcon />} title="The flow">
            <FlowDetailsFields flow={flow} />
          </PanelCard>
          <PanelCard storageId="video-flow-facts" icon={<InfoIcon />} title="Runs">
            <div className="grid gap-4">
              <Fact label="Runs">{flow.runCount === 1 ? "1 run" : `${flow.runCount} runs`}</Fact>
              <Fact label="Last run">{flow.lastRunAt ? formatInboxTime(flow.lastRunAt) : "Never run"}</Fact>
              {flow.problemCount ? (
                <Fact label="Before it can run">
                  <span className="text-destructive">
                    {flow.problemCount === 1 ? "1 thing to fix" : `${flow.problemCount} things to fix`}. Edit flow marks them in red.
                  </span>
                </Fact>
              ) : null}
            </div>
          </PanelCard>
        </>
      }
      footer={
        // Side by side once the panel has room for both words, stacked
        // full width before that, as a page's Open and Edit page are.
        <div className="@container w-full">
          <div className="grid gap-2 @[15rem]:grid-cols-2 [&>*]:w-full">
            {runButton}
            <Button type="button" onClick={() => onEdit(flow.id)}>
              <SettingsIcon />
              Edit flow
            </Button>
          </div>
        </div>
      }
    />
  )
}

/**
 * The flow's name and description, saved as they are typed. Shared with the
 * builder's right panel when no node is picked.
 */
export function FlowDetailsFields({ flow }: { flow: Pick<FlowListItem, "id" | "name" | "description"> }) {
  const router = useRouter()
  const [name, setName] = React.useState(flow.name)
  const [description, setDescription] = React.useState(flow.description)
  const timer = React.useRef(0)
  const pending = React.useRef<{ name?: string; description?: string }>({})

  const flush = React.useCallback(() => {
    window.clearTimeout(timer.current)
    const change = pending.current
    pending.current = {}
    if (change.name === undefined && change.description === undefined) return
    if (change.name !== undefined && !change.name.trim()) delete change.name
    updateFlowDetails(flow.id, change)
      .then(() => router.invalidate())
      .catch((error: unknown) => showErrorToast(getFlowErrorMessage(error)))
  }, [flow.id, router])
  React.useEffect(() => () => flush(), [flush])

  const queue = (change: { name?: string; description?: string }) => {
    pending.current = { ...pending.current, ...change }
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(flush, SAVE_AFTER_MS)
  }

  return (
    <div className="grid gap-4">
      <div className="grid gap-2">
        <FieldLabel htmlFor={`flow-name-${flow.id}`}>Name</FieldLabel>
        <Input
          id={`flow-name-${flow.id}`}
          value={name}
          maxLength={FLOW_NAME_MAX}
          aria-invalid={!name.trim() || undefined}
          onChange={(event) => {
            setName(event.target.value)
            queue({ name: event.target.value })
          }}
          onBlur={flush}
        />
      </div>
      <div className="grid gap-2">
        <FieldLabel htmlFor={`flow-description-${flow.id}`} hint="What the flow is for. Only you read it; the AI is never sent it.">
          Description
        </FieldLabel>
        <Textarea
          id={`flow-description-${flow.id}`}
          rows={1}
          value={description}
          maxLength={2000}
          onChange={(event) => {
            setDescription(event.target.value)
            queue({ description: event.target.value })
          }}
          onBlur={flush}
        />
      </div>
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
