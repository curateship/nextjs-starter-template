import * as React from "react"
import {
  AlertCircleIcon,
  CheckIcon,
  Loader2Icon,
  MinusIcon,
  XIcon,
} from "lucide-react"

import type {
  AutomationNode,
  AutomationSourcePort,
} from "@/lib/automations/automation"
import {
  automationNodeDescription,
  automationNodeIcon,
  automationNodeInputMode,
  automationNodeName,
} from "@/lib/automations/node-registry"
import { cn } from "@/lib/utils"

import { AutomationNodeIcon } from "./automation-node-icon"
import {
  NODE_HEIGHT,
  NODE_WIDTH,
  nodeOutputPorts,
  portOut,
} from "./canvas-model"

// Step status of the run currently shown in the runs panel, badged on the node.
export type AutomationNodeRunStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "skipped"

function RunStatusBadge({ status }: { status: AutomationNodeRunStatus }) {
  const label = `Run step ${status}`
  if (status === "running") {
    return (
      <span
        aria-label={label}
        title={label}
        className="absolute -top-2 -right-2 flex size-5 items-center justify-center rounded-full border border-primary/30 bg-card text-primary shadow-sm"
      >
        <Loader2Icon className="size-3 animate-spin" />
      </span>
    )
  }
  if (status === "completed") {
    return (
      <span
        aria-label={label}
        title={label}
        className="absolute -top-2 -right-2 flex size-5 items-center justify-center rounded-full border border-emerald-500/30 bg-card text-emerald-600 shadow-sm dark:text-emerald-400"
      >
        <CheckIcon className="size-3" />
      </span>
    )
  }
  if (status === "failed") {
    return (
      <span
        aria-label={label}
        title={label}
        className="absolute -top-2 -right-2 flex size-5 items-center justify-center rounded-full border border-destructive/30 bg-card text-destructive shadow-sm"
      >
        <XIcon className="size-3" />
      </span>
    )
  }
  if (status === "skipped") {
    return (
      <span
        aria-label={label}
        title={label}
        className="absolute -top-2 -right-2 flex size-5 items-center justify-center rounded-full border bg-card text-muted-foreground shadow-sm"
      >
        <MinusIcon className="size-3" />
      </span>
    )
  }
  return (
    <span
      aria-label={label}
      title={label}
      className="absolute -top-2 -right-2 flex size-5 items-center justify-center rounded-full border bg-card shadow-sm"
    >
      <span className="size-1.5 rounded-full bg-muted-foreground/50" />
    </span>
  )
}

export function AutomationCanvasNode({
  node,
  selected,
  invalid,
  runStatus,
  connecting,
  onSelect,
  onMoveStart,
  onConnectStart,
  onConnectFinish,
}: {
  node: AutomationNode
  selected: boolean
  invalid: boolean
  runStatus: AutomationNodeRunStatus | null
  connecting: boolean
  onSelect: () => void
  onMoveStart: (event: React.PointerEvent) => void
  onConnectStart: (sourcePort: AutomationSourcePort) => void
  onConnectFinish: () => void
}) {
  const ports = nodeOutputPorts(node)
  const hasInput = automationNodeInputMode(node) === "flow"
  return (
    <div
      role="button"
      tabIndex={0}
      data-node-id={node.id}
      aria-label={`${automationNodeName(node)} node`}
      aria-invalid={invalid || undefined}
      onFocus={onSelect}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault()
          onSelect()
        }
      }}
      onPointerDown={(event) => {
        if (event.button !== 0) return
        event.stopPropagation()
        event.preventDefault()
        event.currentTarget.focus({ preventScroll: true })
        onSelect()
        onMoveStart(event)
      }}
      className={cn(
        "pointer-events-auto absolute top-0 left-0 box-border cursor-grab rounded-xl border border-foreground/5 bg-card shadow-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
        selected && "border-primary ring-3 ring-primary/15",
        invalid && "border-destructive"
      )}
      style={{
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
        transform: `translate(${node.x}px, ${node.y}px)`,
      }}
    >
      <div
        className={cn(
          "flex h-full items-center gap-2 pl-3",
          ports.length > 0 ? "pr-20" : "pr-3"
        )}
      >
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <AutomationNodeIcon
            icon={automationNodeIcon(node)}
            className="size-4"
          />
        </span>
        <span className="min-w-0 flex-1 overflow-hidden">
          <span className="flex items-center gap-1.5 text-xs font-semibold">
            <span className="truncate" title={automationNodeName(node)}>
              {automationNodeName(node)}
            </span>
            {invalid ? (
              <AlertCircleIcon
                aria-label="Node has a validation error"
                className="size-3.5 shrink-0 text-destructive"
              />
            ) : null}
          </span>
          <span
            className="mt-0.5 line-clamp-2 text-[10px] leading-4 text-muted-foreground"
            title={automationNodeDescription(node)}
          >
            {automationNodeDescription(node)}
          </span>
        </span>
      </div>

      {runStatus ? <RunStatusBadge status={runStatus} /> : null}

      {hasInput ? (
        <button
          type="button"
          data-port="input"
          aria-label={`Connect to ${automationNodeName(node)}`}
          onPointerDown={(event) => event.stopPropagation()}
          onPointerUp={(event) => {
            event.stopPropagation()
            onConnectFinish()
          }}
          onClick={(event) => {
            event.stopPropagation()
            onConnectFinish()
          }}
          className={cn(
            "absolute -left-2 size-4 rounded-full border-2 bg-card transition-transform outline-none hover:scale-125 focus-visible:ring-2 focus-visible:ring-ring",
            connecting ? "border-primary" : "border-muted-foreground/60"
          )}
          style={{ top: NODE_HEIGHT / 2 - 8 }}
        />
      ) : null}

      {ports.map((port) => {
        const centerY = portOut(node, port.id).y - node.y
        return (
          <React.Fragment key={port.id}>
            <span
              aria-hidden="true"
              className="absolute right-4 text-[9px] font-semibold tracking-wide text-muted-foreground uppercase"
              style={{ top: centerY - 6 }}
            >
              {port.label}
            </span>
            <button
              type="button"
              data-port={port.id}
              aria-label={`Connect from ${automationNodeName(node)} ${port.label}`}
              onPointerDown={(event) => {
                event.stopPropagation()
                event.preventDefault()
                onConnectStart(port.id)
              }}
              onClick={(event) => {
                event.stopPropagation()
                onConnectStart(port.id)
              }}
              className="absolute -right-2 size-4 rounded-full border-2 border-muted-foreground/60 bg-card transition-transform outline-none hover:scale-125 focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring"
              style={{ top: centerY - 8 }}
            />
          </React.Fragment>
        )
      })}
    </div>
  )
}
