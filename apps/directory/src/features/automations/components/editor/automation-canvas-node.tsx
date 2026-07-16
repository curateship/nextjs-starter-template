import type { PointerEvent as ReactPointerEvent } from "react";
import AlertCircle from "lucide-react/dist/esm/icons/circle-alert.js"
import Bot from "lucide-react/dist/esm/icons/bot.js"
import Clock3 from "lucide-react/dist/esm/icons/clock-3.js"
import FileText from "lucide-react/dist/esm/icons/file-text.js"
import GitBranch from "lucide-react/dist/esm/icons/git-branch.js"
import Globe2 from "lucide-react/dist/esm/icons/earth.js"

import { nodeOutputPorts } from "@/features/automations/domain/catalog";
import type {
  AutomationNode,
  AutomationSourcePort,
} from "@/features/automations/domain/types";
import { cn } from "@/lib/utils/tailwind";
import { AUTOMATION_NODE_WIDTH } from "@/features/automations/domain/catalog";
import { automationNodeHeight, nodeOutputPoint } from "./canvas-model";

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
  node: AutomationNode;
  selected: boolean;
  invalid: boolean;
  connecting: boolean;
  onSelect: () => void;
  onMoveStart: (event: ReactPointerEvent) => void;
  onConnectStart: (port: AutomationSourcePort) => void;
  onConnectFinish: () => void;
}) {
  const ports = nodeOutputPorts(node);
  const height = automationNodeHeight(node);
  const description = nodeDescription(node);

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`${node.name} node`}
      onFocus={onSelect}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect();
        }
      }}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.stopPropagation();
        event.preventDefault();
        event.currentTarget.focus({ preventScroll: true });
        onSelect();
        onMoveStart(event);
      }}
      className={cn(
        "pointer-events-auto absolute top-0 left-0 box-border cursor-grab rounded-xl border border-foreground/5 bg-card shadow-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
        selected && "border-primary ring-3 ring-primary/15",
        invalid && "border-destructive",
      )}
      style={{
        width: AUTOMATION_NODE_WIDTH,
        height,
        transform: `translate(${node.x}px, ${node.y}px)`,
      }}
    >
      <div
        className={cn(
          "flex h-full items-center gap-2 pl-3",
          ports.length ? "pr-20" : "pr-3",
        )}
      >
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <NodeIcon node={node} />
        </span>
        <span className="min-w-0 flex-1 overflow-hidden">
          <span className="flex items-center gap-1.5 text-xs font-semibold">
            <span className="truncate">{node.name}</span>
            {invalid ? (
              <AlertCircle
                className="size-3.5 shrink-0 text-destructive"
                aria-label="Node has errors"
              />
            ) : null}
          </span>
          <span
            className="mt-0.5 line-clamp-2 text-[10px] leading-4 text-muted-foreground"
            title={description}
          >
            {description}
          </span>
        </span>
      </div>

      {node.kind !== "time" ? (
        <button
          type="button"
          aria-label={`Connect to ${node.name}`}
          onPointerDown={(event) => event.stopPropagation()}
          onPointerUp={(event) => {
            event.stopPropagation();
            onConnectFinish();
          }}
          onClick={(event) => {
            event.stopPropagation();
            onConnectFinish();
          }}
          className={cn(
            "absolute -left-2 size-4 rounded-full border-2 bg-card outline-none transition-transform hover:scale-125 focus-visible:ring-2 focus-visible:ring-ring",
            connecting ? "border-primary" : "border-muted-foreground/60",
          )}
          style={{ top: height / 2 - 8 }}
        />
      ) : null}

      {ports.map((port) => {
        const centerY = nodeOutputPoint(node, port.id).y - node.y;
        return (
          <span key={port.id}>
            <span
              className="absolute right-4 max-w-14 truncate text-[9px] font-semibold uppercase tracking-wide text-muted-foreground"
              style={{ top: centerY - 6 }}
              title={port.label}
            >
              {port.label}
            </span>
            <button
              type="button"
              aria-label={`Connect from ${node.name} ${port.label}`}
              onPointerDown={(event) => {
                event.stopPropagation();
                event.preventDefault();
                onConnectStart(port.id);
              }}
              onClick={(event) => {
                event.stopPropagation();
                onConnectStart(port.id);
              }}
              className="absolute -right-2 size-4 rounded-full border-2 border-muted-foreground/60 bg-card outline-none transition-transform hover:scale-125 focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring"
              style={{ top: centerY - 8 }}
            />
          </span>
        );
      })}
    </div>
  );
}

function NodeIcon({ node }: { node: AutomationNode }) {
  if (node.kind === "time") return <Clock3 className="size-4" />;
  if (node.kind === "scraper") return <Globe2 className="size-4" />;
  if (node.kind === "router") return <GitBranch className="size-4" />;
  if (node.kind === "agent") return <Bot className="size-4" />;
  return <FileText className="size-4" />;
}

function nodeDescription(node: AutomationNode) {
  if (node.kind === "time")
    return `${node.config.schedule.frequency} · ${node.config.schedule.timezone}`;
  if (node.kind === "scraper")
    return `${node.config.urls.filter(Boolean).length} website${node.config.urls.filter(Boolean).length === 1 ? "" : "s"}`;
  if (node.kind === "router")
    return `${node.config.routes.length} routes · ${node.config.model}`;
  if (node.kind === "agent") return node.config.model;
  return node.config.publish ? "Publish post" : "Create draft post";
}
