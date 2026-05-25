"use client";

import { useState } from "react";
import { AdminLayout } from "@/components/admin/layout/admin-layout";
import { DashboardSubheader } from "@/components/admin/layout/dashboard/DashboardSubheader";
import { StickyHeader } from "@/components/admin/layout/stickybar/StickyHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  TableRightActions,
  TableRightActionsButton,
  TableRightActionsSearch,
  TableRightActionsSelectTrigger,
} from "@/components/admin/layout/content/table-right-actions";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import {
  Settings,
  Play,
  Pause,
  Trash2,
  Clock,
  Zap,
  Globe,
  MousePointer,
  Workflow,
  Plus,
} from "lucide-react";
import {
  AdminSortButton,
  AdminTableShell,
  AdminTableSummaryFooter,
  useAdminSort,
} from "@/components/admin/layout/list";

type WorkflowTrigger = "manual" | "schedule" | "webhook" | "event";
type WorkflowStatus = "active" | "paused" | "draft";
type WorkflowSortColumn = "name" | "trigger" | "status" | "lastRun";

interface MockWorkflow {
  id: string;
  name: string;
  description: string;
  trigger: WorkflowTrigger;
  status: WorkflowStatus;
  lastRun: string | null;
  lastRunSuccess: boolean | null;
}

const mockWorkflows: MockWorkflow[] = [
  {
    id: "1",
    name: "Viral Tracker",
    description: "Track Instagram Reels performance",
    trigger: "schedule",
    status: "active",
    lastRun: "2 hours ago",
    lastRunSuccess: true,
  },
  {
    id: "2",
    name: "SEO Content Generator",
    description: "Generate blog posts from keywords",
    trigger: "manual",
    status: "draft",
    lastRun: null,
    lastRunSuccess: null,
  },
  {
    id: "3",
    name: "Lead Nurture Sequence",
    description: "Email follow-up after signup",
    trigger: "event",
    status: "active",
    lastRun: "1 day ago",
    lastRunSuccess: true,
  },
  {
    id: "4",
    name: "Price Monitor",
    description: "Track competitor pricing daily",
    trigger: "schedule",
    status: "paused",
    lastRun: "3 days ago",
    lastRunSuccess: false,
  },
];

const triggerIcons: Record<WorkflowTrigger, React.ReactNode> = {
  manual: <MousePointer className="h-3 w-3 mr-1" />,
  schedule: <Clock className="h-3 w-3 mr-1" />,
  webhook: <Globe className="h-3 w-3 mr-1" />,
  event: <Zap className="h-3 w-3 mr-1" />,
};

const triggerLabels: Record<WorkflowTrigger, string> = {
  manual: "Manual",
  schedule: "Schedule",
  webhook: "Webhook",
  event: "Event",
};

function getTriggerBadge(trigger: WorkflowTrigger) {
  return (
    <Badge variant="outline" className="capitalize">
      {triggerIcons[trigger]}
      {triggerLabels[trigger]}
    </Badge>
  );
}

function getStatusBadge(status: WorkflowStatus) {
  switch (status) {
    case "active":
      return (
        <Badge variant="default" className="bg-green-100 text-green-800">
          Active
        </Badge>
      );
    case "paused":
      return (
        <Badge variant="default" className="bg-yellow-100 text-yellow-800">
          Paused
        </Badge>
      );
    case "draft":
      return <Badge variant="secondary">Draft</Badge>;
  }
}

export default function AutomationsPage() {
  const [filterStatus, setFilterStatus] = useState<"all" | WorkflowStatus>(
    "all",
  );
  const [searchQuery, setSearchQuery] = useState("");
  const workflowSort = useAdminSort<WorkflowSortColumn>();

  const normalizedSearchQuery = searchQuery.trim().toLowerCase();
  const filteredWorkflows = mockWorkflows.filter((w) => {
    const statusMatch = filterStatus === "all" || w.status === filterStatus;
    const searchText =
      `${w.name} ${w.description} ${w.trigger} ${w.status}`.toLowerCase();
    const searchMatch =
      !normalizedSearchQuery || searchText.includes(normalizedSearchQuery);

    return statusMatch && searchMatch;
  });

  const sortedWorkflows = [...filteredWorkflows].sort((a, b) => {
    if (!workflowSort.sortColumn) return 0;
    const dir = workflowSort.sortDirection === "asc" ? 1 : -1;
    if (workflowSort.sortColumn === "name")
      return a.name.localeCompare(b.name) * dir;
    if (workflowSort.sortColumn === "trigger")
      return a.trigger.localeCompare(b.trigger) * dir;
    if (workflowSort.sortColumn === "status")
      return a.status.localeCompare(b.status) * dir;
    if (workflowSort.sortColumn === "lastRun") {
      if (!a.lastRun && !b.lastRun) return 0;
      if (!a.lastRun) return 1;
      if (!b.lastRun) return -1;
      return a.lastRun.localeCompare(b.lastRun) * dir;
    }
    return 0;
  });

  const statusCounts = {
    all: mockWorkflows.length,
    active: mockWorkflows.filter((w) => w.status === "active").length,
    paused: mockWorkflows.filter((w) => w.status === "paused").length,
    draft: mockWorkflows.filter((w) => w.status === "draft").length,
  };

  return (
    <>
      <StickyHeader />
      <AdminLayout>
        <div className="w-full">
          {/* Breadcrumb navigation + action buttons */}
          <DashboardSubheader items={[{ label: "Automations" }]} />

          <AdminTableShell
            title="Automations"
            icon={<Workflow className="size-4 text-muted-foreground sm:size-[18px]" />}
            count={filteredWorkflows.length}
            controls={
              <TableRightActions>
                <TableRightActionsSearch
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Search automations"
                />
                <Select
                  value={filterStatus}
                  onValueChange={(value) =>
                    setFilterStatus(value as "all" | WorkflowStatus)
                  }
                >
                  <TableRightActionsSelectTrigger aria-label="Workflow status filter">
                    <SelectValue />
                  </TableRightActionsSelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">
                      All ({statusCounts.all})
                    </SelectItem>
                    <SelectItem value="active">
                      Active ({statusCounts.active})
                    </SelectItem>
                    <SelectItem value="paused">
                      Paused ({statusCounts.paused})
                    </SelectItem>
                    <SelectItem value="draft">
                      Draft ({statusCounts.draft})
                    </SelectItem>
                  </SelectContent>
                </Select>
                <TableRightActionsButton onClick={() => {}}>
                  <Plus className="h-4 w-4" />
                  <span className="hidden sm:inline">New Workflow</span>
                </TableRightActionsButton>
              </TableRightActions>
            }
            footer={<AdminTableSummaryFooter count={filteredWorkflows.length} label="automations" />}
          >

            <ScrollArea className="w-full">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead column="main">
                      <AdminSortButton
                        active={workflowSort.sortColumn === "name"}
                        direction={workflowSort.sortDirection}
                        onClick={() => workflowSort.toggleSort("name")}
                      >
                        Workflow
                      </AdminSortButton>
                    </TableHead>
                    <TableHead column="meta">
                      <AdminSortButton
                        active={workflowSort.sortColumn === "trigger"}
                        direction={workflowSort.sortDirection}
                        onClick={() => workflowSort.toggleSort("trigger")}
                      >
                        Trigger
                      </AdminSortButton>
                    </TableHead>
                    <TableHead column="meta">
                      <AdminSortButton
                        active={workflowSort.sortColumn === "status"}
                        direction={workflowSort.sortDirection}
                        onClick={() => workflowSort.toggleSort("status")}
                      >
                        Status
                      </AdminSortButton>
                    </TableHead>
                    <TableHead column="meta">
                      <AdminSortButton
                        active={workflowSort.sortColumn === "lastRun"}
                        direction={workflowSort.sortDirection}
                        onClick={() => workflowSort.toggleSort("lastRun")}
                      >
                        Last Run
                      </AdminSortButton>
                    </TableHead>
                    <TableHead column="meta">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredWorkflows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="h-32 text-center">
                        <Workflow className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
                        <p className="text-muted-foreground">
                          {mockWorkflows.length === 0
                            ? "No workflows found"
                            : `No ${filterStatus === "all" ? "" : filterStatus} workflows found`}
                        </p>
                      </TableCell>
                    </TableRow>
                  ) : (
                    sortedWorkflows.map((workflow) => (
                      <TableRow key={workflow.id} className="group">
                        <TableCell column="main">
                          <div className="flex min-w-0 items-center space-x-4">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-muted">
                              <Workflow className="h-5 w-5 text-muted-foreground" />
                            </div>
                            <div className="min-w-0">
                              <h4 className="truncate text-sm font-medium sm:text-base">
                                {workflow.name}
                              </h4>
                              <p className="truncate text-xs text-muted-foreground sm:text-sm">
                                {workflow.description}
                              </p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell column="meta">
                          {getTriggerBadge(workflow.trigger)}
                        </TableCell>
                        <TableCell column="meta">
                          {getStatusBadge(workflow.status)}
                        </TableCell>
                        <TableCell column="mutedMeta">
                          {workflow.lastRun ? (
                            <div className="flex items-center gap-1.5">
                              <span
                                className={`inline-block h-2 w-2 rounded-full ${workflow.lastRunSuccess ? "bg-green-500" : "bg-red-500"}`}
                              />
                              <span>{workflow.lastRun}</span>
                            </div>
                          ) : (
                            "Never"
                          )}
                        </TableCell>
                        <TableCell column="meta">
                          <div className="flex items-center space-x-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0"
                              title="Edit"
                            >
                              <Settings className="h-4 w-4" />
                              <span className="sr-only">Edit</span>
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0"
                              title="Run Now"
                            >
                              <Play className="h-4 w-4" />
                              <span className="sr-only">Run Now</span>
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0"
                              title={
                                workflow.status === "paused"
                                  ? "Resume"
                                  : "Pause"
                              }
                            >
                              <Pause className="h-4 w-4" />
                              <span className="sr-only">
                                {workflow.status === "paused"
                                  ? "Resume"
                                  : "Pause"}
                              </span>
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0 text-foreground hover:text-foreground"
                              title="Delete"
                            >
                              <Trash2 className="h-4 w-4" />
                              <span className="sr-only">Delete</span>
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
              <ScrollBar orientation="horizontal" />
            </ScrollArea>
          </AdminTableShell>
        </div>
      </AdminLayout>
    </>
  );
}
