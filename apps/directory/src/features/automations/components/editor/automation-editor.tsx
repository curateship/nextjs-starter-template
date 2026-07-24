"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "@/components/app-link";
import ArrowLeft from "lucide-react/dist/esm/icons/arrow-left.js"
import Loader2 from "lucide-react/dist/esm/icons/loader-circle.js"
import PanelLeft from "lucide-react/dist/esm/icons/panel-left.js"
import PanelRight from "lucide-react/dist/esm/icons/panel-right.js"
import Pause from "lucide-react/dist/esm/icons/pause.js"
import Play from "lucide-react/dist/esm/icons/play.js"
import Save from "lucide-react/dist/esm/icons/save.js"
import Workflow from "lucide-react/dist/esm/icons/workflow.js"

import { AdminLayout } from "@/components/admin/layout/admin-layout";
import { StickyHeader } from "@/components/admin/layout/stickybar/StickyHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
  WorkspacePanel,
} from "@/components/ui/resizable";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { createAutomationNode } from "@/features/automations/domain/catalog";
import { validateAutomationGraph } from "@/features/automations/domain/graph";
import { isAutomationNodeKind } from "@/features/automations/domain/node-registry";
import type {
  AutomationEditorData,
  AutomationGraph,
  AutomationNode,
  AutomationNodeKind,
  AutomationValidationError,
} from "@/features/automations/domain/types";
import {
  getAutomationEditorData,
  runAutomationNow,
  saveAutomation,
  setAutomationStatus,
} from "@/lib/actions/automations/automation-actions";
import {
  showActionError,
  showActionSuccess,
} from "@/lib/utils/admin-action-feedback";
import { AutomationCanvas } from "./automation-canvas";
import { AutomationInspector } from "./automation-inspector";
import { AutomationPalette } from "./automation-palette";
import { AutomationRunHistory } from "./automation-run-history";
import {
  nextNodePosition,
  type CanvasPoint,
  type CanvasSize,
} from "./canvas-model";

const FAVORITE_NODE_KINDS_KEY = "hub-automation-favorite-node-kinds";

export function AutomationEditor({ automationId }: { automationId: string }) {
  const [data, setData] = useState<AutomationEditorData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [graph, setGraph] = useState<AutomationGraph | null>(null);
  const [serverErrors, setServerErrors] = useState<AutomationValidationError[]>(
    [],
  );
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [canvasSize, setCanvasSize] = useState<CanvasSize>({
    width: 800,
    height: 560,
  });
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [changingStatus, setChangingStatus] = useState(false);
  const [desktop, setDesktop] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [previewNode, setPreviewNode] = useState<AutomationNode | null>(null);
  const [draggedKind, setDraggedKind] = useState<AutomationNodeKind | null>(
    null,
  );
  const [favoriteNodeKinds, setFavoriteNodeKinds] = useState<
    AutomationNodeKind[]
  >([]);
  const [favoritesLoaded, setFavoritesLoaded] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(min-width: 1024px)");
    const update = () => setDesktop(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    try {
      const saved = JSON.parse(
        localStorage.getItem(FAVORITE_NODE_KINDS_KEY) || "[]",
      );
      setFavoriteNodeKinds(
        Array.isArray(saved) ? [...new Set(saved.filter(isAutomationNodeKind))] : [],
      );
    } catch {
      setFavoriteNodeKinds([]);
    } finally {
      setFavoritesLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!favoritesLoaded) return;
    try {
      localStorage.setItem(
        FAVORITE_NODE_KINDS_KEY,
        JSON.stringify(favoriteNodeKinds),
      );
    } catch {
      showActionError("Could not save node favorites in this browser.");
    }
  }, [favoriteNodeKinds, favoritesLoaded]);

  useEffect(() => {
    let cancelled = false;
    void getAutomationEditorData(automationId).then((result) => {
      if (cancelled) return;
      if (result.error || !result.data) {
        setLoadError(result.error || "Automation not found");
        return;
      }
      setData(result.data);
      setName(result.data.automation.name);
      setGraph(result.data.automation.graph);
      setServerErrors(result.data.validationErrors);
    });
    return () => {
      cancelled = true;
    };
  }, [automationId]);

  const validationErrors = useMemo(() => {
    if (!graph || !data) return [];
    return [
      ...validateAutomationGraph(graph),
      ...clientResourceErrors(graph, data),
    ];
  }, [data, graph]);

  const changeGraph = useCallback((next: AutomationGraph) => {
    setGraph(next);
    setDirty(true);
    setServerErrors([]);
  }, []);

  const selectedNode =
    previewNode ??
    graph?.nodes.find((node) => node.id === selectedNodeId) ??
    null;
  const selectedEdge =
    graph?.edges.find((edge) => edge.id === selectedEdgeId) ?? null;

  const createNodeForKind = useCallback(
    (kind: AutomationNodeKind, position: CanvasPoint) => {
      if (!data) return null;
      let node = createAutomationNode(kind, position.x, position.y);
      const provider = data.providers[0];
      if (node.kind === "agent" && provider)
        node = {
          ...node,
          config: {
            ...node.config,
            provider: provider.provider,
            model: provider.defaultModel,
          },
        };
      if (node.kind === "router" && provider)
        node = {
          ...node,
          config: {
            ...node.config,
            provider: provider.provider,
            model: provider.defaultModel,
          },
        };
      if (node.kind === "listing" && provider)
        node = {
          ...node,
          config: {
            ...node.config,
            provider: provider.provider,
            model: provider.defaultModel,
          },
        };
      const defaultTemplate =
        data.templates.find((template) => template.isDefault) ??
        data.templates[0];
      if (node.kind === "post" && defaultTemplate)
        node = {
          ...node,
          config: { ...node.config, templateId: defaultTemplate.id },
        };
      const defaultListingTemplate =
        data.listingTemplates.find((template) => template.isDefault) ??
        data.listingTemplates[0];
      if (node.kind === "listing" && defaultListingTemplate)
        node = {
          ...node,
          config: { ...node.config, templateId: defaultListingTemplate.id },
        };
      return node;
    },
    [data],
  );

  const placeNode = useCallback(
    (node: AutomationNode, position?: CanvasPoint) => {
      if (
        !graph ||
        (node.kind === "time" &&
          graph.nodes.some((item) => item.kind === "time"))
      )
        return;
      const nextPosition =
        position ??
        nextNodePosition(graph.nodes.length, graph.viewport, canvasSize.width);
      const placedNode = { ...node, x: nextPosition.x, y: nextPosition.y };
      changeGraph({ ...graph, nodes: [...graph.nodes, placedNode] });
      setPreviewNode(null);
      setSelectedNodeId(placedNode.id);
      setSelectedEdgeId(null);
      setPaletteOpen(false);
      if (!desktop) setInspectorOpen(true);
    },
    [canvasSize.width, changeGraph, desktop, graph],
  );

  const addNodeAt = useCallback(
    (kind: AutomationNodeKind, position: CanvasPoint) => {
      const node = createNodeForKind(kind, position);
      if (node) placeNode(node, position);
    },
    [createNodeForKind, placeNode],
  );

  const addNode = useCallback(
    (kind: AutomationNodeKind) => {
      if (!graph) return;
      addNodeAt(
        kind,
        nextNodePosition(graph.nodes.length, graph.viewport, canvasSize.width),
      );
    },
    [addNodeAt, canvasSize.width, graph],
  );

  const previewPaletteNode = useCallback(
    (kind: AutomationNodeKind) => {
      const node = createNodeForKind(kind, { x: 0, y: 0 });
      if (!node) return;
      setPreviewNode(node);
      setSelectedNodeId(null);
      setSelectedEdgeId(null);
      setPaletteOpen(false);
      if (!desktop) setInspectorOpen(true);
    },
    [createNodeForKind, desktop],
  );

  const updateNode = useCallback(
    (node: AutomationNode) => {
      if (node.id === previewNode?.id) {
        setPreviewNode(node);
        return;
      }
      if (!graph) return;
      const previous = graph.nodes.find((item) => item.id === node.id);
      const removedRoutePorts =
        previous?.kind === "router" && node.kind === "router"
          ? previous.config.routes
              .filter(
                (route) =>
                  !node.config.routes.some((next) => next.id === route.id),
              )
              .map((route) => `route:${route.id}`)
          : [];
      changeGraph({
        ...graph,
        nodes: graph.nodes.map((item) => (item.id === node.id ? node : item)),
        edges: graph.edges.filter(
          (edge) =>
            edge.from !== node.id ||
            !removedRoutePorts.includes(edge.sourcePort),
        ),
      });
    },
    [changeGraph, graph, previewNode?.id],
  );

  const deleteNode = useCallback(
    (nodeId: string) => {
      if (nodeId === previewNode?.id) {
        setPreviewNode(null);
        return;
      }
      if (!graph) return;
      changeGraph({
        ...graph,
        nodes: graph.nodes.filter((node) => node.id !== nodeId),
        edges: graph.edges.filter(
          (edge) => edge.from !== nodeId && edge.to !== nodeId,
        ),
      });
      setSelectedNodeId(null);
    },
    [changeGraph, graph, previewNode?.id],
  );

  const toggleFavoriteNode = useCallback((kind: AutomationNodeKind) => {
    setFavoriteNodeKinds((current) =>
      current.includes(kind)
        ? current.filter((candidate) => candidate !== kind)
        : [...current, kind],
    );
  }, []);

  const deleteEdge = useCallback(
    (edgeId: string) => {
      if (!graph) return;
      changeGraph({
        ...graph,
        edges: graph.edges.filter((edge) => edge.id !== edgeId),
      });
      setSelectedEdgeId(null);
    },
    [changeGraph, graph],
  );

  async function handleSave(showToast = true) {
    if (!graph || !data) return { saved: false, valid: false };
    setSaving(true);
    const result = await saveAutomation({ automationId, name, graph });
    setSaving(false);
    if (result.error || !result.data) {
      showActionError(result.error || "Failed to save automation");
      return { saved: false, valid: false };
    }
    setGraph(result.data.graph);
    setName(result.data.name);
    setData((current) =>
      current ? { ...current, automation: result.data! } : current,
    );
    setServerErrors(result.validationErrors);
    setDirty(false);
    if (showToast)
      showActionSuccess(
        result.validationErrors.length
          ? "Draft saved with validation issues"
          : "Automation saved",
      );
    return { saved: true, valid: result.validationErrors.length === 0 };
  }

  async function handleRun() {
    if (!data) return;
    setRunning(true);
    const saved = dirty
      ? await handleSave(false)
      : { saved: true, valid: validationErrors.length === 0 };
    if (!saved.saved || !saved.valid) {
      setRunning(false);
      showActionError(
        validationErrors[0]?.message ||
          serverErrors[0]?.message ||
          "Fix the automation before running it.",
      );
      return;
    }
    const result = await runAutomationNow(automationId);
    setRunning(false);
    if (result.error || !result.data)
      return showActionError(result.error || "Automation run failed");
    setData((current) =>
      current
        ? {
            ...current,
            runs: [
              result.data!,
              ...current.runs.filter((run) => run.id !== result.data!.id),
            ].slice(0, 25),
            automation: {
              ...current.automation,
              lastRunAt: result.data!.startedAt,
              lastRunStatus: result.data!.status,
            },
          }
        : current,
    );
    showActionSuccess(
      result.data.status === "partial"
        ? "Automation finished with partial results"
        : "Automation run finished",
    );
  }

  async function handleStatus() {
    if (!data) return;
    setChangingStatus(true);
    if (dirty) {
      const saved = await handleSave(false);
      if (
        !saved.saved ||
        (data.automation.status !== "active" && !saved.valid)
      ) {
        setChangingStatus(false);
        showActionError(
          validationErrors[0]?.message ||
            "Fix the automation before activating it.",
        );
        return;
      }
    }
    const nextStatus =
      data.automation.status === "active" ? "paused" : "active";
    const result = await setAutomationStatus(automationId, nextStatus);
    setChangingStatus(false);
    if (result.error || !result.data) {
      setServerErrors(result.validationErrors);
      return showActionError(result.error || "Failed to update automation");
    }
    setData((current) =>
      current
        ? { ...current, automation: { ...current.automation, ...result.data! } }
        : current,
    );
    showActionSuccess(
      nextStatus === "active" ? "Automation activated" : "Automation paused",
    );
  }

  if (loadError)
    return (
      <>
        <StickyHeader />
        <AdminLayout>
          <div className="rounded-xl border bg-card p-8 text-center">
            <h1 className="font-semibold">Automation unavailable</h1>
            <p className="mt-2 text-sm text-muted-foreground">{loadError}</p>
            <Button asChild variant="outline" className="mt-4">
              <Link href="/admin/automations">
                <ArrowLeft />
                Back to automations
              </Link>
            </Button>
          </div>
        </AdminLayout>
      </>
    );
  if (!data || !graph)
    return (
      <>
        <StickyHeader />
        <AdminLayout>
          {null}
        </AdminLayout>
      </>
    );

  const inspector = (
    <AutomationInspector
      node={selectedNode}
      edge={selectedEdge}
      data={data}
      errors={dedupeValidationErrors([...validationErrors, ...serverErrors])}
      favorite={
        selectedNode ? favoriteNodeKinds.includes(selectedNode.kind) : undefined
      }
      onToggleFavorite={
        selectedNode ? () => toggleFavoriteNode(selectedNode.kind) : undefined
      }
      onAddNode={previewNode ? () => placeNode(previewNode) : undefined}
      onNodeChange={updateNode}
      onDeleteNode={deleteNode}
      onDeleteEdge={deleteEdge}
    />
  );
  const palette = (
    <AutomationPalette
      hasTime={graph.nodes.some((node) => node.kind === "time")}
      favoriteNodeKinds={favoriteNodeKinds}
      onSelect={previewPaletteNode}
      onAdd={addNode}
      onDragStart={setDraggedKind}
      onDragEnd={() => setDraggedKind(null)}
    />
  );
  const canvas = (
    <AutomationCanvas
      graph={graph}
      errors={validationErrors}
      selectedNodeId={selectedNodeId}
      selectedEdgeId={selectedEdgeId}
      onGraphChange={changeGraph}
      onSelectNode={(id) => {
        setPreviewNode(null);
        setSelectedNodeId(id);
        if (id) setSelectedEdgeId(null);
      }}
      onSelectEdge={(id) => {
        setPreviewNode(null);
        setSelectedEdgeId(id);
        if (id) setSelectedNodeId(null);
      }}
      onSizeChange={setCanvasSize}
      onDropNode={
        draggedKind
          ? (position) => {
              addNodeAt(draggedKind, position);
              setDraggedKind(null);
            }
          : undefined
      }
    />
  );

  const workspace = desktop ? (
    <ResizablePanelGroup orientation="horizontal" className="min-h-0 flex-1">
      <ResizablePanel
        id="palette"
        defaultSize="14%"
        minSize="14%"
        maxSize="26%"
      >
        <WorkspacePanel>{palette}</WorkspacePanel>
      </ResizablePanel>
      <ResizableHandle gap />
      <ResizablePanel id="canvas" defaultSize="68%" minSize="30%">
        <WorkspacePanel>{canvas}</WorkspacePanel>
      </ResizablePanel>
      <ResizableHandle gap />
      <ResizablePanel
        id="inspector"
        defaultSize="18%"
        minSize="18%"
        maxSize="34%"
      >
        <WorkspacePanel>{inspector}</WorkspacePanel>
      </ResizablePanel>
    </ResizablePanelGroup>
  ) : (
    <WorkspacePanel>{canvas}</WorkspacePanel>
  );

  return (
    <>
      <StickyHeader />
      <AdminLayout noPadding>
        <div className="flex h-[calc(100dvh-4rem)] min-h-[560px] flex-col bg-muted/60">
          <div className="flex h-12 shrink-0 items-center gap-2 border-b bg-card px-2 sm:px-3">
            <Button asChild variant="ghost" size="icon-xs" className="shrink-0">
              <Link href="/admin/automations" aria-label="Back to automations">
                <ArrowLeft className="size-4" />
              </Link>
            </Button>
            <Input
              aria-label="Automation name"
              value={name}
              maxLength={255}
              onChange={(event) => {
                setName(event.target.value);
                setDirty(true);
              }}
              className="h-7 min-w-0 max-w-44 border-0 bg-transparent px-1 text-sm font-semibold shadow-none focus-visible:ring-0 sm:max-w-56"
            />
            <div className="ml-auto flex items-center gap-1">
              {!desktop ? (
                <>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setPaletteOpen(true)}
                    aria-label="Open node palette"
                  >
                    <PanelLeft />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setInspectorOpen(true)}
                    aria-label="Open inspector"
                  >
                    <PanelRight />
                  </Button>
                </>
              ) : null}
              <div className="mr-1 hidden items-center gap-2 sm:flex">
                <StatusBadge status={data.automation.status} />
                {dirty ? (
                  <span className="text-xs text-muted-foreground">
                    Unsaved changes
                  </span>
                ) : null}
                {validationErrors.length ? (
                  <Badge
                    variant="destructive"
                    className="hidden md:inline-flex"
                  >
                    {validationErrors.length} issue
                    {validationErrors.length === 1 ? "" : "s"}
                  </Badge>
                ) : (
                  <Badge variant="outline" className="hidden md:inline-flex">
                    Ready
                  </Badge>
                )}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void handleSave()}
                disabled={saving || running || !dirty}
              >
                {saving ? <Loader2 className="animate-spin" /> : <Save />}
                <span className="hidden sm:inline">Save</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                title="Run this automation once now without changing its schedule."
                onClick={() => void handleRun()}
                disabled={running || saving}
              >
                {running ? <Loader2 className="animate-spin" /> : <Play />}
                <span className="hidden sm:inline">Run now</span>
              </Button>
              <Button
                size="sm"
                variant={
                  data.automation.status === "active" ? "outline" : "default"
                }
                title={
                  data.automation.status === "active"
                    ? "Pause future scheduled runs."
                    : "Enable future runs on this automation's schedule."
                }
                onClick={() => void handleStatus()}
                disabled={changingStatus || saving || running}
              >
                {changingStatus ? (
                  <Loader2 className="animate-spin" />
                ) : data.automation.status === "active" ? (
                  <Pause />
                ) : (
                  <Workflow />
                )}
                <span className="hidden sm:inline">
                  {data.automation.status === "active" ? "Pause" : "Activate"}
                </span>
              </Button>
            </div>
          </div>

          <div className="min-h-0 flex-1 p-[var(--shell-gutter,0.75rem)]">
            <ResizablePanelGroup orientation="vertical" className="min-h-0">
              <ResizablePanel id="workspace" defaultSize="75%" minSize="45%">
                <div className="flex h-full min-h-0">{workspace}</div>
              </ResizablePanel>
              <ResizableHandle gap />
              <ResizablePanel
                id="history"
                defaultSize="25%"
                minSize="16%"
                maxSize="45%"
              >
                <WorkspacePanel>
                  <AutomationRunHistory runs={data.runs} />
                </WorkspacePanel>
              </ResizablePanel>
            </ResizablePanelGroup>
          </div>
        </div>
      </AdminLayout>

      <Sheet open={paletteOpen} onOpenChange={setPaletteOpen}>
        <SheetContent side="left" className="gap-0 p-0">
          <SheetTitle className="sr-only">Automation nodes</SheetTitle>
          {palette}
        </SheetContent>
      </Sheet>
      <Sheet open={inspectorOpen} onOpenChange={setInspectorOpen}>
        <SheetContent side="right" className="gap-0 p-0">
          <SheetTitle className="sr-only">Node inspector</SheetTitle>
          {inspector}
        </SheetContent>
      </Sheet>
    </>
  );
}

function StatusBadge({
  status,
}: {
  status: AutomationEditorData["automation"]["status"];
}) {
  if (status === "active")
    return (
      <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
        Active
      </Badge>
    );
  if (status === "paused")
    return (
      <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200">
        Paused
      </Badge>
    );
  return <Badge variant="secondary">Draft</Badge>;
}

function clientResourceErrors(
  graph: AutomationGraph,
  data: AutomationEditorData,
) {
  const errors: AutomationValidationError[] = [];
  const providers = new Set(data.providers.map((item) => item.provider));
  const templates = new Set(data.templates.map((item) => item.id));
  const listingTemplates = new Set(data.listingTemplates.map((item) => item.id));
  const categories = new Set(data.categories.map((item) => item.id));
  for (const node of graph.nodes) {
    if (
      (node.kind === "agent" ||
        node.kind === "router" ||
        node.kind === "listing") &&
      !providers.has(node.config.provider)
    )
      errors.push({
        code: "provider-missing",
        message: `${node.name} uses an AI provider that is not configured.`,
        nodeId: node.id,
      });
    if (
      node.kind === "listing" &&
      node.config.templateId &&
      !listingTemplates.has(node.config.templateId)
    )
      errors.push({
        code: "listing-template-missing",
        message: "The selected Listing template is unavailable.",
        nodeId: node.id,
      });
    if (
      node.kind === "listing" &&
      node.config.categoryId &&
      !categories.has(node.config.categoryId)
    )
      errors.push({
        code: "listing-category-missing",
        message: "The selected Listing category is unavailable.",
        nodeId: node.id,
      });
    if (
      node.kind === "post" &&
      node.config.templateId &&
      !templates.has(node.config.templateId)
    )
      errors.push({
        code: "post-template-missing",
        message: "The selected Post template is unavailable.",
        nodeId: node.id,
      });
    if (
      node.kind === "post" &&
      node.config.categoryIds.some((id) => !categories.has(id))
    )
      errors.push({
        code: "post-category-missing",
        message: "One or more selected Post categories are unavailable.",
        nodeId: node.id,
      });
  }
  return errors;
}

function dedupeValidationErrors(errors: AutomationValidationError[]) {
  const seen = new Set<string>();
  return errors.filter((error) => {
    const key = `${error.code}:${error.nodeId ?? ""}:${error.edgeId ?? ""}:${error.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
