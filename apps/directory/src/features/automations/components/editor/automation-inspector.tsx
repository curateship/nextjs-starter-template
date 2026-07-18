"use client";

import Plus from "lucide-react/dist/esm/icons/plus.js"
import Star from "lucide-react/dist/esm/icons/star.js"
import Trash2 from "lucide-react/dist/esm/icons/trash-2.js"

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import type {
  AutomationEditorData,
  AutomationEdge,
  AutomationNode,
  AutomationValidationError,
} from "@/features/automations/domain/types";
import { cn } from "@/lib/utils/tailwind";
import { Field, getNodeUI } from "./node-ui";

export function AutomationInspector({
  node,
  edge,
  data,
  errors,
  favorite,
  onToggleFavorite,
  onAddNode,
  onNodeChange,
  onDeleteNode,
  onDeleteEdge,
}: {
  node: AutomationNode | null;
  edge: AutomationEdge | null;
  data: Pick<
    AutomationEditorData,
    "templates" | "listingTemplates" | "categories" | "providers"
  >;
  errors: AutomationValidationError[];
  favorite?: boolean;
  onToggleFavorite?: () => void;
  onAddNode?: () => void;
  onNodeChange: (node: AutomationNode) => void;
  onDeleteNode: (nodeId: string) => void;
  onDeleteEdge: (edgeId: string) => void;
}) {
  if (!node && !edge) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center text-sm text-muted-foreground">
        Select a node or connection to configure it.
      </div>
    );
  }

  if (edge) {
    return (
      <div className="flex h-full flex-col">
        <InspectorHeader title="Connection" onDelete={() => onDeleteEdge(edge.id)} />
        <div className="p-4 text-sm text-muted-foreground">
          This connection passes the source node output to the next node.
        </div>
      </div>
    );
  }

  if (!node) return null;
  const nodeErrors = errors.filter((error) => error.nodeId === node.id);
  const ui = getNodeUI(node.kind);
  const Panel = ui.Panel;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <InspectorHeader
        title={node.name}
        node={node}
        favorite={favorite}
        onToggleFavorite={onToggleFavorite}
        onDelete={() => onDeleteNode(node.id)}
      />
      <ScrollArea className="min-h-0 flex-1">
        <div className="grid gap-5 p-4">
          {nodeErrors.length ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
              <ul className="list-disc space-y-1 pl-4">
                {nodeErrors.map((error) => (
                  <li key={`${error.code}-${error.message}`}>{error.message}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {!ui.hideName ? (
            <Field label="Node name" htmlFor="node-name">
              <Input
                id="node-name"
                className="rounded-xl"
                value={node.name}
                maxLength={100}
                onChange={(event) =>
                  onNodeChange({ ...node, name: event.target.value })
                }
              />
            </Field>
          ) : null}

          <Panel node={node} data={data} onChange={onNodeChange} />

          {onAddNode ? (
            <Button size="sm" className="w-full rounded-xl" onClick={onAddNode}>
              <Plus />
              Add node
            </Button>
          ) : null}
        </div>
      </ScrollArea>
    </div>
  );
}

function InspectorHeader({
  title,
  node,
  favorite,
  onToggleFavorite,
  onDelete,
}: {
  title: string;
  node?: AutomationNode;
  favorite?: boolean;
  onToggleFavorite?: () => void;
  onDelete: () => void;
}) {
  const Icon = node ? getNodeUI(node.kind).icon : null;
  return (
    <div className="flex shrink-0 items-center justify-between gap-3 border-b px-4 py-3">
      <div className="flex min-w-0 items-center gap-3">
        {node && Icon ? (
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-foreground text-background">
            <Icon className="size-4" />
          </span>
        ) : null}
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <div className="truncate text-base font-semibold">{title}</div>
            {node ? (
              <Badge className="border-0 bg-amber-100 px-2 py-0.5 text-[10px] tracking-[0.16em] text-amber-700 dark:bg-amber-950 dark:text-amber-200">
                {node.kind.toUpperCase()}
              </Badge>
            ) : null}
          </div>
          <div className="mt-0.5 text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Inspector
          </div>
        </div>
      </div>
      <div className="flex items-center gap-1">
        {onToggleFavorite ? (
          <Button
            variant="ghost"
            size="icon-sm"
            className={cn(favorite && "text-amber-500")}
            onClick={onToggleFavorite}
            aria-label={`${favorite ? "Remove" : "Add"} ${title} ${favorite ? "from" : "to"} favorites`}
            aria-pressed={favorite}
          >
            <Star className={cn("size-4", favorite && "fill-current")} />
          </Button>
        ) : null}
        <Button
          variant="ghost"
          size="icon-sm"
          className="text-muted-foreground hover:text-destructive"
          onClick={onDelete}
          aria-label={`Delete ${title}`}
        >
          <Trash2 />
        </Button>
      </div>
    </div>
  );
}
