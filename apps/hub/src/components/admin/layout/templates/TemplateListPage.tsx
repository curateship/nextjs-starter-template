"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { FileText, Plus, Settings, Star, Trash2 } from "lucide-react"

import { AdminLayout } from "@/components/admin/layout/admin-layout"
import {
  AdminBulkDeleteButton,
  AdminConfirmDialog,
  AdminListFooter,
  AdminListSkeleton,
  AdminSelectionBanner,
  AdminSortButton,
  useAdminBulkSelection,
  useAdminSort
} from "@/components/admin/layout/list"
import { DashboardModalContent, DashboardModalCardTitle } from "@/components/admin/layout/dashboard/modals"
import {
  TableRightActions,
  TableRightActionsButton
} from "@/components/admin/layout/content/table-right-actions"
import { DashboardSubheader } from "@/components/admin/layout/dashboard/DashboardSubheader"
import { useSiteSwitcher } from "@/components/admin/layout/providers/site-switcher-provider"
import { StickyHeader } from "@/components/admin/layout/stickybar/StickyHeader"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardGroup, CardHeader } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog } from "@/components/ui/dialog"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableSurface } from "@/components/ui/table"
import { cn } from "@/lib/utils/tailwind"

type TemplateSortColumn = "name" | "blocks" | "modified"

export type AdminTemplateRecord = {
  id: string
  name: string
  content_blocks: Record<string, any>
  is_default: boolean
  updated_at: string
}

interface TemplateListPageProps<TTemplate extends AdminTemplateRecord> {
  breadcrumbParent: {
    label: string
    href: string
  }
  createPlaceholder: string
  createTemplate: (input: { siteId: string; name: string }) => Promise<{ data: TTemplate | null; error: string | null }>
  deleteTemplates: (ids: string[]) => Promise<{ success: boolean; error: string | null }>
  emptyText: string
  getBlockCount: (template: TTemplate) => number
  getTemplateIds: (siteId: string) => Promise<{ ids: string[]; error: string | null }>
  getTemplatesBySite: (
    siteId: string,
    options?: { page?: number; pageSize?: number }
  ) => Promise<{
    data: TTemplate[] | null
    total: number
    error: string | null
  }>
  routeBase: string
  setDefaultTemplate: (templateId: string) => Promise<{ success: boolean; error: string | null }>
}

function formatDate(dateString: string) {
  const date = new Date(dateString)
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  })
}

export function TemplateListPage<TTemplate extends AdminTemplateRecord>({
  breadcrumbParent,
  createPlaceholder,
  createTemplate,
  deleteTemplates,
  emptyText,
  getBlockCount,
  getTemplateIds,
  getTemplatesBySite,
  routeBase,
  setDefaultTemplate
}: TemplateListPageProps<TTemplate>) {
  const { currentSite } = useSiteSwitcher()
  const router = useRouter()
  const templateSelection = useAdminBulkSelection()
  const templateSort = useAdminSort<TemplateSortColumn>()
  const [templates, setTemplates] = useState<TTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [massDeleting, setMassDeleting] = useState(false)
  const [massDeleteConfirmOpen, setMassDeleteConfirmOpen] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [searchQuery, setSearchQuery] = useState("")
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [formName, setFormName] = useState("")
  const [creating, setCreating] = useState(false)
  const pageSize = 50

  const loadTemplates = useCallback(async () => {
    if (!currentSite?.id) {
      setLoading(true)
      setTemplates([])
      setTotal(0)
      return
    }

    try {
      setLoading(true)
      setError(null)
      const {
        data,
        total: totalCount,
        error: loadError
      } = await getTemplatesBySite(currentSite.id, {
        page: currentPage,
        pageSize
      })
      if (loadError) {
        setError(loadError)
        return
      }
      setTemplates(data || [])
      setTotal(totalCount)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load templates")
    } finally {
      setLoading(false)
    }
  }, [currentPage, currentSite?.id, getTemplatesBySite])

  useEffect(() => {
    loadTemplates()
  }, [loadTemplates])

  async function handleCreate() {
    if (!currentSite?.id || !formName.trim()) return
    setCreating(true)

    const { data, error: createError } = await createTemplate({
      siteId: currentSite.id,
      name: formName.trim()
    })

    if (createError) {
      setError(createError)
      setCreating(false)
      return
    }

    setCreating(false)
    setCreateModalOpen(false)
    setFormName("")
    if (data) {
      router.push(`${routeBase}/${data.id}`)
    }
  }

  async function handleMassDelete() {
    setMassDeleting(true)
    const { error: deleteError } = await deleteTemplates(Array.from(templateSelection.selectedIds))
    if (deleteError) {
      setError(deleteError)
    } else {
      templateSelection.clearSelection()
    }
    setMassDeleting(false)
    setMassDeleteConfirmOpen(false)
    loadTemplates()
  }

  const normalizedSearchQuery = searchQuery.trim().toLowerCase()
  const filteredTemplates = normalizedSearchQuery
    ? templates.filter((template) => template.name.toLowerCase().includes(normalizedSearchQuery))
    : templates
  const deletableTemplates = filteredTemplates.filter((template) => !template.is_default)
  const deletableTemplateIds = deletableTemplates.map((template) => template.id)
  const selectableTotal = normalizedSearchQuery ? deletableTemplates.length : Math.max(0, total - (total > 0 ? 1 : 0))
  const pageSelectionChecked = templateSelection.isPageSelected(deletableTemplateIds)

  const sortedTemplates = [...filteredTemplates].sort((a, b) => {
    if (!templateSort.sortColumn) return 0
    const dir = templateSort.sortDirection === "asc" ? 1 : -1
    if (templateSort.sortColumn === "name") return a.name.localeCompare(b.name) * dir
    if (templateSort.sortColumn === "blocks") return (getBlockCount(a) - getBlockCount(b)) * dir
    if (templateSort.sortColumn === "modified") {
      return (new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime()) * dir
    }
    return 0
  })

  async function handleSelectAll() {
    if (!currentSite?.id || total === 0) return
    const { ids, error: idsError } = await getTemplateIds(currentSite.id)
    if (idsError) {
      setError(idsError)
      return
    }
    templateSelection.selectAll(ids)
  }

  async function handleSetDefault(templateId: string) {
    const { error: defaultError } = await setDefaultTemplate(templateId)
    if (defaultError) {
      setError(defaultError)
    }
    templateSelection.remove(templateId)
    loadTemplates()
  }

  function handleSearchChange(value: string) {
    setSearchQuery(value)
    templateSelection.clearSelection()
  }

  function handlePageChange(page: number) {
    setCurrentPage(page)
    templateSelection.clearSelection()
  }

  function handleTogglePageSelection() {
    if (pageSelectionChecked) {
      templateSelection.clearSelection()
      return
    }
    templateSelection.selectOnly(deletableTemplateIds)
  }

  function openCreateModal() {
    setFormName("")
    setCreateModalOpen(true)
  }

  return (
    <>
      <StickyHeader />
      <AdminLayout>
        <div className="w-full">
          <DashboardSubheader items={[breadcrumbParent, { label: "Templates" }]} />

          <TableSurface>
            <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:gap-4">
              <div className="flex flex-1 items-center gap-2 sm:gap-2.5">
                <span className="flex size-7 shrink-0 items-center justify-center sm:size-8">
                  <FileText className="size-4 text-muted-foreground sm:size-[18px]" />
                </span>
                <span className="text-sm font-medium sm:text-base">Templates</span>
                <Badge variant="secondary">{filteredTemplates.length}</Badge>
                {templateSelection.selectedCount ? (
                  <button
                    type="button"
                    className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
                    onClick={templateSelection.clearSelection}
                  >
                    Clear {templateSelection.selectedCount} selected
                  </button>
                ) : null}
                <div className="ml-auto">
                  <AdminBulkDeleteButton
                    deleting={massDeleting}
                    onClick={() => setMassDeleteConfirmOpen(true)}
                    selectedCount={templateSelection.selectedCount}
                  />
                </div>
              </div>
              <TableRightActions>
                <TableRightActionsButton onClick={openCreateModal}>
                  <Plus className="h-4 w-4" />
                  <span className="hidden sm:inline">Create Template</span>
                </TableRightActionsButton>
              </TableRightActions>
            </div>
            <AdminSelectionBanner
              allSelected={templateSelection.allSelected}
              onClearSelection={templateSelection.clearSelection}
              onSelectAll={handleSelectAll}
              selectedCount={templateSelection.selectedCount}
              total={selectableTotal}
              visibleCount={deletableTemplates.length}
            />
            <ScrollArea className="w-full">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead column="select">
                      <Checkbox
                        checked={pageSelectionChecked}
                        onCheckedChange={handleTogglePageSelection}
                        aria-label="Select all templates"
                      />
                    </TableHead>
                    <TableHead column="main">
                      <AdminSortButton
                        active={templateSort.sortColumn === "name"}
                        direction={templateSort.sortDirection}
                        onClick={() => templateSort.toggleSort("name")}
                      >
                        Name
                      </AdminSortButton>
                    </TableHead>
                    <TableHead column="meta">
                      <AdminSortButton
                        active={templateSort.sortColumn === "blocks"}
                        direction={templateSort.sortDirection}
                        onClick={() => templateSort.toggleSort("blocks")}
                      >
                        Blocks
                      </AdminSortButton>
                    </TableHead>
                    <TableHead column="meta">
                      <AdminSortButton
                        active={templateSort.sortColumn === "modified"}
                        direction={templateSort.sortDirection}
                        onClick={() => templateSort.toggleSort("modified")}
                      >
                        Modified
                      </AdminSortButton>
                    </TableHead>
                    <TableHead column="meta">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <AdminListSkeleton columns={5} rowCount={5} showThumbnail={false} />
                  ) : error ? (
                    <TableRow>
                      <TableCell colSpan={5} className="h-32 text-center">
                        <p className="mb-4 text-red-600">{error}</p>
                        <Button onClick={() => loadTemplates()} variant="outline" size="sm">
                          Try Again
                        </Button>
                      </TableCell>
                    </TableRow>
                  ) : filteredTemplates.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="h-32 text-center">
                        <FileText className="mx-auto mb-4 h-10 w-10 text-muted-foreground" />
                        <p className="mb-4 text-muted-foreground">
                          {normalizedSearchQuery ? "No templates match your search." : emptyText}
                        </p>
                        <Button onClick={openCreateModal} variant="outline">
                          Create Template
                        </Button>
                      </TableCell>
                    </TableRow>
                  ) : (
                    sortedTemplates.map((template) => (
                      <TableRow
                        key={template.id}
                        data-state={templateSelection.selectedIds.has(template.id) ? "selected" : undefined}
                        className="group"
                      >
                        <TableCell column="select">
                          <Checkbox
                            checked={templateSelection.selectedIds.has(template.id)}
                            onCheckedChange={() => templateSelection.toggleOne(template.id)}
                            aria-label={`Select ${template.name}`}
                            disabled={template.is_default}
                          />
                        </TableCell>
                        <TableCell column="main">
                          <Link href={`${routeBase}/${template.id}`} className="transition-opacity hover:opacity-80">
                            <h4 className="text-sm font-medium hover:underline">{template.name}</h4>
                          </Link>
                        </TableCell>
                        <TableCell column="mutedMeta">{getBlockCount(template)}</TableCell>
                        <TableCell column="mutedMeta">{formatDate(template.updated_at)}</TableCell>
                        <TableCell column="meta">
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              className={cn("h-8 w-8 p-0", template.is_default && "text-yellow-500 hover:text-yellow-500")}
                              onClick={() => handleSetDefault(template.id)}
                              title={template.is_default ? "Default template" : "Set as default"}
                              disabled={template.is_default}
                            >
                              <Star className={cn("h-4 w-4", template.is_default && "fill-current")} />
                              <span className="sr-only">{template.is_default ? "Default" : "Set as default"}</span>
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0"
                              onClick={() => router.push(`${routeBase}/${template.id}`)}
                              title="Edit Template"
                            >
                              <Settings className="h-4 w-4" />
                              <span className="sr-only">Edit Template</span>
                            </Button>
                            {!template.is_default && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0 text-red-600 hover:text-red-600"
                                onClick={() => {
                                  templateSelection.selectOnly([template.id])
                                  setMassDeleteConfirmOpen(true)
                                }}
                                title="Delete Template"
                              >
                                <Trash2 className="h-4 w-4" />
                                <span className="sr-only">Delete Template</span>
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
              <ScrollBar orientation="horizontal" />
            </ScrollArea>

            {!loading && <AdminListFooter currentPage={currentPage} onPageChange={handlePageChange} pageSize={pageSize} total={total} />}
          </TableSurface>
        </div>
      </AdminLayout>

      <Dialog open={createModalOpen} onOpenChange={setCreateModalOpen}>
        <DashboardModalContent
          className="max-w-xl"
          title="Create Template"
          footer={
            <>
              <Button variant="outline" onClick={() => setCreateModalOpen(false)} disabled={creating}>
                Cancel
              </Button>
              <Button onClick={handleCreate} disabled={creating || !formName.trim()}>
                {creating ? "Creating..." : "Create Template"}
              </Button>
            </>
          }
        >
          <CardGroup className="grid">
            <Card>
              <CardHeader>
                <DashboardModalCardTitle>Template</DashboardModalCardTitle>
              </CardHeader>
              <CardContent>
                <Field>
                  <FieldLabel htmlFor="template-name">Name *</FieldLabel>
                  <Input
                    id="template-name"
                    value={formName}
                    onChange={(event) => setFormName(event.target.value)}
                    placeholder={createPlaceholder}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault()
                        handleCreate()
                      }
                    }}
                  />
                </Field>
              </CardContent>
            </Card>
          </CardGroup>
        </DashboardModalContent>
      </Dialog>

      <AdminConfirmDialog
        open={massDeleteConfirmOpen}
        onCancel={() => setMassDeleteConfirmOpen(false)}
        onConfirm={handleMassDelete}
        disabled={massDeleting}
        title="Delete Templates"
        description={`Are you sure you want to delete ${templateSelection.selectedCount} template${
          templateSelection.selectedCount !== 1 ? "s" : ""
        }? This cannot be undone.`}
        confirmLabel={massDeleting ? "Deleting..." : "Delete"}
      />
    </>
  )
}
