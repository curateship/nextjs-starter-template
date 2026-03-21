"use client"

import { useState } from "react"
import { AdminLayout } from "@/components/admin/layout/admin-layout"
import { AdminPageHeader } from "@/components/admin/layout/dashboard/AdminPageHeader"
import { StickyHeader } from "@/components/admin/layout/dashboard/StickyHeader"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Settings, Play, Pause, Trash2, Clock, Zap, Globe, MousePointer, Workflow, ArrowUp, ArrowDown, ChevronsUpDown, Plus } from "lucide-react"
import { cn } from "@/lib/utils"

type WorkflowTrigger = 'manual' | 'schedule' | 'webhook' | 'event'
type WorkflowStatus = 'active' | 'paused' | 'draft'

interface MockWorkflow {
  id: string
  name: string
  description: string
  trigger: WorkflowTrigger
  status: WorkflowStatus
  lastRun: string | null
  lastRunSuccess: boolean | null
}

const mockWorkflows: MockWorkflow[] = [
  { id: '1', name: 'Viral Tracker', description: 'Track Instagram Reels performance', trigger: 'schedule', status: 'active', lastRun: '2 hours ago', lastRunSuccess: true },
  { id: '2', name: 'SEO Content Generator', description: 'Generate blog posts from keywords', trigger: 'manual', status: 'draft', lastRun: null, lastRunSuccess: null },
  { id: '3', name: 'Lead Nurture Sequence', description: 'Email follow-up after signup', trigger: 'event', status: 'active', lastRun: '1 day ago', lastRunSuccess: true },
  { id: '4', name: 'Price Monitor', description: 'Track competitor pricing daily', trigger: 'schedule', status: 'paused', lastRun: '3 days ago', lastRunSuccess: false },
]

const triggerIcons: Record<WorkflowTrigger, React.ReactNode> = {
  manual: <MousePointer className="h-3 w-3 mr-1" />,
  schedule: <Clock className="h-3 w-3 mr-1" />,
  webhook: <Globe className="h-3 w-3 mr-1" />,
  event: <Zap className="h-3 w-3 mr-1" />,
}

const triggerLabels: Record<WorkflowTrigger, string> = {
  manual: 'Manual',
  schedule: 'Schedule',
  webhook: 'Webhook',
  event: 'Event',
}

function getTriggerBadge(trigger: WorkflowTrigger) {
  return (
    <Badge variant="outline" className="capitalize">
      {triggerIcons[trigger]}
      {triggerLabels[trigger]}
    </Badge>
  )
}

function getStatusBadge(status: WorkflowStatus) {
  switch (status) {
    case 'active':
      return <Badge variant="default" className="bg-green-100 text-green-800">Active</Badge>
    case 'paused':
      return <Badge variant="default" className="bg-yellow-100 text-yellow-800">Paused</Badge>
    case 'draft':
      return <Badge variant="secondary">Draft</Badge>
  }
}

export default function AutomationsPage() {
  const [filterStatus, setFilterStatus] = useState<'all' | WorkflowStatus>('all')
  const [sortColumn, setSortColumn] = useState<'name' | 'trigger' | 'status' | 'lastRun' | null>(null)
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')

  const filteredWorkflows = mockWorkflows.filter(w => {
    if (filterStatus === 'all') return true
    return w.status === filterStatus
  })

  const toggleSort = (column: 'name' | 'trigger' | 'status' | 'lastRun') => {
    if (sortColumn === column) {
      if (sortDirection === 'desc') {
        setSortColumn(null)
        setSortDirection('asc')
      } else {
        setSortDirection('desc')
      }
    } else {
      setSortColumn(column)
      setSortDirection('asc')
    }
  }

  const getSortIcon = (column: 'name' | 'trigger' | 'status' | 'lastRun') => {
    if (sortColumn !== column) return <ChevronsUpDown className="h-3 w-3 opacity-70" />
    if (sortDirection === 'asc') return <ArrowUp className="h-3 w-3" />
    return <ArrowDown className="h-3 w-3" />
  }

  const sortedWorkflows = [...filteredWorkflows].sort((a, b) => {
    if (!sortColumn) return 0
    const dir = sortDirection === 'asc' ? 1 : -1
    if (sortColumn === 'name') return a.name.localeCompare(b.name) * dir
    if (sortColumn === 'trigger') return a.trigger.localeCompare(b.trigger) * dir
    if (sortColumn === 'status') return a.status.localeCompare(b.status) * dir
    if (sortColumn === 'lastRun') {
      if (!a.lastRun && !b.lastRun) return 0
      if (!a.lastRun) return 1
      if (!b.lastRun) return -1
      return a.lastRun.localeCompare(b.lastRun) * dir
    }
    return 0
  })

  const statusCounts = {
    all: mockWorkflows.length,
    active: mockWorkflows.filter(w => w.status === 'active').length,
    paused: mockWorkflows.filter(w => w.status === 'paused').length,
    draft: mockWorkflows.filter(w => w.status === 'draft').length,
  }

  return (
    <>
      <StickyHeader />
      <AdminLayout>
        <div className="w-full">
          <AdminPageHeader
            title="Automations"
            primaryAction={{
              label: "New Workflow",
              icon: <Plus className="h-4 w-4 sm:mr-2" />,
              mobileIconOnly: true,
              onClick: () => {},
            }}
            extraContent={
              <Tabs value={filterStatus} onValueChange={(value) => setFilterStatus(value as 'all' | WorkflowStatus)}>
                <TabsList className="h-auto p-1 gap-1">
                  <TabsTrigger value="all">All ({statusCounts.all})</TabsTrigger>
                  <TabsTrigger value="active">Active ({statusCounts.active})</TabsTrigger>
                  <TabsTrigger value="paused">Paused ({statusCounts.paused})</TabsTrigger>
                  <TabsTrigger value="draft">Draft ({statusCounts.draft})</TabsTrigger>
                </TabsList>
              </Tabs>
            }
          />

          <Card className="shadow-sm">
            {/* Table Header */}
            <div className="px-6 py-4 border-b bg-muted/30">
              <div className="grid grid-cols-6 gap-4 text-sm font-medium text-muted-foreground">
                <div className="col-span-2">
                  <button
                    type="button"
                    onClick={() => toggleSort('name')}
                    className={cn(
                      "flex items-center gap-1.5",
                      "text-[0.8125rem] text-muted-foreground hover:text-foreground",
                      "cursor-pointer outline-none transition-colors"
                    )}
                  >
                    <span>Workflow</span>
                    <span className="ml-2 flex h-3.5 w-3.5 items-center justify-center">{getSortIcon('name')}</span>
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => toggleSort('trigger')}
                  className={cn(
                    "flex items-center gap-1.5",
                    "text-[0.8125rem] text-muted-foreground hover:text-foreground",
                    "cursor-pointer outline-none transition-colors"
                  )}
                >
                  <span>Trigger</span>
                  <span className="ml-2 flex h-3.5 w-3.5 items-center justify-center">{getSortIcon('trigger')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => toggleSort('status')}
                  className={cn(
                    "flex items-center gap-1.5",
                    "text-[0.8125rem] text-muted-foreground hover:text-foreground",
                    "cursor-pointer outline-none transition-colors"
                  )}
                >
                  <span>Status</span>
                  <span className="ml-2 flex h-3.5 w-3.5 items-center justify-center">{getSortIcon('status')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => toggleSort('lastRun')}
                  className={cn(
                    "flex items-center gap-1.5",
                    "text-[0.8125rem] text-muted-foreground hover:text-foreground",
                    "cursor-pointer outline-none transition-colors"
                  )}
                >
                  <span>Last Run</span>
                  <span className="ml-2 flex h-3.5 w-3.5 items-center justify-center">{getSortIcon('lastRun')}</span>
                </button>
                <div>Actions</div>
              </div>
            </div>

            <div className="divide-y divide-muted/80">
              {filteredWorkflows.length === 0 ? (
                <div className="p-8 text-center">
                  <Workflow className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                  <p className="text-muted-foreground mb-4">
                    {mockWorkflows.length === 0
                      ? 'No workflows found'
                      : `No ${filterStatus === 'all' ? '' : filterStatus} workflows found`
                    }
                  </p>
                </div>
              ) : (
                sortedWorkflows.map((workflow) => (
                  <div key={workflow.id} className="p-6">
                    <div className="grid grid-cols-6 gap-4 items-center">
                      <div className="col-span-2">
                        <div className="flex items-center space-x-4">
                          <div className="w-10 h-10 bg-muted rounded flex items-center justify-center">
                            <Workflow className="h-5 w-5 text-muted-foreground" />
                          </div>
                          <div>
                            <h4 className="font-medium">{workflow.name}</h4>
                            <p className="text-sm text-muted-foreground">{workflow.description}</p>
                          </div>
                        </div>
                      </div>
                      <div>
                        {getTriggerBadge(workflow.trigger)}
                      </div>
                      <div>
                        {getStatusBadge(workflow.status)}
                      </div>
                      <div>
                        {workflow.lastRun ? (
                          <div className="flex items-center gap-1.5">
                            <span className={`inline-block h-2 w-2 rounded-full ${workflow.lastRunSuccess ? 'bg-green-500' : 'bg-red-500'}`} />
                            <span className="text-sm text-muted-foreground">{workflow.lastRun}</span>
                          </div>
                        ) : (
                          <span className="text-sm text-muted-foreground">Never</span>
                        )}
                      </div>
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
                          title={workflow.status === 'paused' ? 'Resume' : 'Pause'}
                        >
                          <Pause className="h-4 w-4" />
                          <span className="sr-only">{workflow.status === 'paused' ? 'Resume' : 'Pause'}</span>
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 text-red-600 hover:text-red-600"
                          title="Delete"
                        >
                          <Trash2 className="h-4 w-4" />
                          <span className="sr-only">Delete</span>
                        </Button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>
      </AdminLayout>
    </>
  )
}
