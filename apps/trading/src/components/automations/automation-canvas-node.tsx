import * as React from "react"
import {
  ActivityIcon,
  AlertCircleIcon,
  GitBranchIcon,
  OctagonXIcon,
  RepeatIcon,
  ShieldXIcon,
  TargetIcon,
  TimerIcon,
  TrendingDownIcon,
  TrendingUpIcon,
} from "lucide-react"

import type {
  AutomationNode,
  AutomationSourcePort,
} from "@/lib/automations/automation"
import { cn } from "@/lib/utils"

import {
  NODE_HEIGHT,
  NODE_WIDTH,
  nodeAttachmentPorts,
  nodeOutputPorts,
  portOut,
} from "./canvas-model"
import { automationNodeDescription, automationNodeName } from "./node-labels"

export function AutomationCanvasNode({
  node,
  selected,
  invalid,
  connecting,
  onSelect,
  onMoveStart,
  onConnectStart,
  onConnectFinish,
}: {
  node: AutomationNode
  selected: boolean
  invalid: boolean
  connecting: boolean
  onSelect: () => void
  onMoveStart: (event: React.PointerEvent) => void
  onConnectStart: (sourcePort: AutomationSourcePort) => void
  onConnectFinish: () => void
}) {
  const ports = nodeOutputPorts(node)
  const attachmentPorts = nodeAttachmentPorts(node)
  const isProtectionNode =
    node.kind === "takeProfit" || node.kind === "stopLoss"
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
        "pointer-events-auto absolute top-0 left-0 box-border cursor-grab rounded-xl border bg-card shadow-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
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
          <NodeIcon node={node} />
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

      {/* Take Profit / Stop Loss attach vertically, so their inbound hooks sit
          on the top and bottom edges instead of the left. */}
      {isProtectionNode ? (
        (["top", "bottom"] as const).map((edge) => (
          <button
            key={edge}
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
              "absolute left-1/2 size-4 -translate-x-1/2 rounded-full border-2 bg-card outline-none transition-transform hover:scale-125 focus-visible:ring-2 focus-visible:ring-ring",
              connecting ? "border-primary" : "border-muted-foreground/60"
            )}
            style={edge === "top" ? { top: -8 } : { bottom: -8 }}
          />
        ))
      ) : (
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
            "absolute -left-2 size-4 rounded-full border-2 bg-card outline-none transition-transform hover:scale-125 focus-visible:ring-2 focus-visible:ring-ring",
            connecting ? "border-primary" : "border-muted-foreground/60"
          )}
          style={{ top: NODE_HEIGHT / 2 - 8 }}
        />
      )}

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
              className="absolute -right-2 size-4 rounded-full border-2 border-muted-foreground/60 bg-card outline-none transition-transform hover:scale-125 focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring"
              style={{ top: centerY - 8 }}
            />
          </React.Fragment>
        )
      })}

      {attachmentPorts.map((port) => {
        const onTop = port.edge === "top"
        // Colour carries the meaning: green = take profit, red = stop loss.
        const isTp = port.id === "tp"
        const label = isTp ? "Take profit" : "Stop loss"
        return (
          <button
            key={port.id}
            type="button"
            data-port={port.id}
            title={`${label} — connect a ${label} node`}
            aria-label={`Connect from ${automationNodeName(node)} ${label} hook`}
            onPointerDown={(event) => {
              event.stopPropagation()
              event.preventDefault()
              onConnectStart(port.id)
            }}
            onClick={(event) => {
              event.stopPropagation()
              onConnectStart(port.id)
            }}
            className={cn(
              "absolute left-1/2 size-4 -translate-x-1/2 rounded-full border-2 bg-card outline-none transition-transform hover:scale-125 focus-visible:ring-2 focus-visible:ring-ring",
              isTp ? "border-emerald-500" : "border-red-500"
            )}
            style={onTop ? { top: -8 } : { bottom: -8 }}
          />
        )
      })}
    </div>
  )
}

function NodeIcon({ node }: { node: AutomationNode }) {
  if (node.kind === "indicator") return <ActivityIcon className="size-4" />
  if (node.kind === "logic") return <GitBranchIcon className="size-4" />
  if (node.kind === "lookback") return <TimerIcon className="size-4" />
  if (node.kind === "takeProfit") return <TargetIcon className="size-4" />
  if (node.kind === "stopLoss") return <OctagonXIcon className="size-4" />
  if (node.action === "buy") return <TrendingUpIcon className="size-4" />
  if (node.action === "short") return <TrendingDownIcon className="size-4" />
  if (node.action === "reverse") return <RepeatIcon className="size-4" />
  return <ShieldXIcon className="size-4" />
}
