"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "@/components/app-link"
import { useRouter } from "@/lib/navigation-client"
import FileText from "lucide-react/dist/esm/icons/file-text.js"
import Plus from "lucide-react/dist/esm/icons/plus.js"
import Settings from "lucide-react/dist/esm/icons/settings.js"
import Star from "lucide-react/dist/esm/icons/star.js"
import Trash2 from "lucide-react/dist/esm/icons/trash-2.js"

import { AdminLayout } from "@/components/admin/layout/admin-layout"
import {
  AdminBulkDeleteButton,
  AdminListFooter,
  AdminListPending,
  AdminSelectionBanner,
  AdminSortableHead,
  AdminSortButton,
  AdminTableShell,
  ConfirmDestructive,
  useAdminBulkSelection,
  useAdminSort,
} from "@/components/admin/layout/list"
import { DashboardModalCardTitle, DashboardModalContent, DashboardModalFormFooter } from "@/components/admin/layout/dashboard/modals"
import { TemplateSettingsModal } from "@/components/admin/layout/templates/TemplateSettingsModal"
import {
  TableRightActions,
  TableRightActionsButton
} from "@/components/admin/layout/content/table-right-actions"
import { DashboardSubheader } from "@/components/admin/layout/dashboard/DashboardSubheader"
import { useClearSelectionOnListChange } from "@/lib/use-clear-selection"
import { useSiteSwitcher } from "@/components/admin/layout/providers/site-switcher-provider"
import { StickyHeader } from "@/components/admin/layout/stickybar/StickyHeader"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardGroup, CardHeader } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog } from "@/components/ui/dialog"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { cn } from "@/lib/utils/tailwind"
import { showActionError, showActionSuccess } from "@/lib/utils/admin-action-feedback"
import { dismissErrorToast, showErrorToast } from "@/lib/error-toast"

type TemplateSortColumn = "name" | "blocks" | "modified"

export type AdminTemplateRecord = {
  id: string
  site_id: string
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
  updateTemplate?: (templateId: string, updates: { name?: string; content_blocks?: Record<string, any> }) => Promise<{ data: TTemplate | null; error: string | null }>
  enableDefaultCategoryParent?: boolean
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
  setDefaultTemplate,
  updateTemplate,
  enableDefaultCategoryParent = false
}: TemplateListPageProps<TTemplate>) {
  const { currentSite, pageSize } = useSiteSwitcher()
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
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [formName, setFormName] = useState("")
  const [formNameInvalid, setFormNameInvalid] = useState(false)
  const [creating, setCreating] = useState(false)
  const [settingsTemplate, setSettingsTemplate] = useState<TTemplate | null>(null)

  function reportError(message: string) {
    setError(message)
    showActionError(message)
  }

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
        reportError(loadError)
        return
      }
      setTemplates(data || [])
      setTotal(totalCount)
    } catch (err) {
      reportError(err instanceof Error ? err.message : "Failed to load templates")
    } finally {
      setLoading(false)
    }
  }, [currentPage, currentSite?.id, getTemplatesBySite, pageSize])

  useEffect(() => {
    loadTemplates()
  }, [loadTemplates])

  // Ticks never survive a change to what the table is showing.
  useClearSelectionOnListChange(
    templateSelection,
    `${currentSite?.id}|${templateSort.sortColumn}|${templateSort.sortDirection}|${currentPage}|${pageSize}`
  )

  async function handleCreate() {
    if (!currentSite?.id) return
    if (!formName.trim()) {
      setFormNameInvalid(true)
      showErrorToast("Template name is required")
      return
    }

    setFormNameInvalid(false)
    dismissErrorToast()
    setCreating(true)

    const { data, error: createError } = await createTemplate({
      siteId: currentSite.id,
      name: formName.trim()
    })

    if (createError) {
      reportError(createError)
      setCreating(false)
      return
    }

    setCreating(false)
    setCreateModalOpen(false)
    setFormName("")
    if (data) {
      showActionSuccess("Template created.")
      router.push(`${routeBase}/${data.id}`)
    }
  }

  async function handleMassDelete() {
    setMassDeleting(true)
    const deletedCount = templateSelection.selectedIds.size
    const { error: deleteError } = await deleteTemplates(Array.from(templateSelection.selectedIds))
    if (deleteError) {
      reportError(deleteError)
    } else {
      templateSelection.clearSelection()
      setMassDeleteConfirmOpen(false)
      loadTemplates()
      showActionSuccess(deletedCount === 1 ? "Template deleted." : "Templates deleted.")
    }
    setMassDeleting(false)
  }

  const deletableTemplates = templates.filter((template) => !template.is_default)
  const deletableTemplateIds = deletableTemplates.map((template) => template.id)
  const selectableTotal = Math.max(0, total - (total > 0 ? 1 : 0))
  const pageSelectionChecked = templateSelection.isPageSelected(deletableTemplateIds)

  const sortedTemplates = [...templates].sort((a, b) => {
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
      reportError(idsError)
      return
    }
    templateSelection.selectAll(ids)
  }

  async function handleSetDefault(templateId: string) {
    const { error: defaultError } = await setDefaultTemplate(templateId)
    if (defaultError) {
      reportError(defaultError)
    } else {
      showActionSuccess("Default template updated.")
    }
    templateSelection.remove(templateId)
    loadTemplates()
  }

  function handlePageChange(page: number) {
    setCurrentPage(page)
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

  function openSettingsModal(template: TTemplate) {
    setSettingsTemplate(template)
  }

  return (
    <>
      <StickyHeader />
      <AdminLayout>
        <div className="w-full">
          <DashboardSubheader items={[breadcrumbParent, { label: "Templates" }]} />

          <AdminTableShell
            error={error ? { message: error, onRetry: () => loadTemplates() } : null}
            title="Templates"
            icon={<FileText className="text-muted-foreground" />}
            count={templates.length}
            loading={loading}
            selectedCount={templateSelection.selectedCount}
            onClearSelection={templateSelection.clearSelection}
            titleActions={
              <AdminBulkDeleteButton
                deleting={massDeleting}
                onClick={() => setMassDeleteConfirmOpen(true)}
                selectedCount={templateSelection.selectedCount}
              />
            }
            controls={
              <TableRightActions>
                <TableRightActionsButton onClick={openCreateModal}>
                  <Plus className="h-4 w-4" />
                  <span className="hidden sm:inline">Create Template</span>
                </TableRightActionsButton>
              </TableRightActions>
            }
            footer={!loading ? <AdminListFooter currentPage={currentPage} onPageChange={handlePageChange} pageSize={pageSize} total={total} /> : null}
          >
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
                    <AdminSortableHead column="main" sort={templateSort} sortKey="name">Name</AdminSortableHead>
                    <AdminSortableHead column="meta" sort={templateSort} sortKey="blocks">Blocks</AdminSortableHead>
                    <AdminSortableHead column="meta" sort={templateSort} sortKey="modified">Modified</AdminSortableHead>
                    <TableHead column="meta">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading && sortedTemplates.length === 0 ? (
                    <AdminListPending />
                  ) : templates.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="h-32 text-center">
                        <FileText className="mx-auto mb-4 h-10 w-10 text-muted-foreground" />
                        <p className="mb-4 text-muted-foreground">
                          {emptyText}
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
                              onClick={() => updateTemplate ? openSettingsModal(template) : router.push(`${routeBase}/${template.id}`)}
                              title={updateTemplate ? "Template Settings" : "Edit Template"}
                            >
                              <Settings className="h-4 w-4" />
                              <span className="sr-only">{updateTemplate ? "Template Settings" : "Edit Template"}</span>
                            </Button>
                            {!template.is_default && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0 text-foreground hover:text-foreground"
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
          </AdminTableShell>
        </div>
      </AdminLayout>

      <Dialog open={createModalOpen} onOpenChange={setCreateModalOpen}>
        <DashboardModalContent
          busy={creating}
          className="max-w-xl"
          title="Create Template"
          footer={<DashboardModalFormFooter busy={creating} cancelDisabled={creating} form="create-template-form" onCancel={() => setCreateModalOpen(false)} submitLabel="Create Template" />}
        >
          <form
            noValidate
            id="create-template-form"
            className="contents"
            onSubmit={(event) => {
              event.preventDefault()
              handleCreate()
            }}
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
                    aria-invalid={formNameInvalid}
                    onChange={(event) => {
                      setFormName(event.target.value)
                      if (formNameInvalid && event.target.value.trim()) setFormNameInvalid(false)
                    }}
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
          </form>
        </DashboardModalContent>
      </Dialog>

      {updateTemplate ? (
        <TemplateSettingsModal
          createPlaceholder={createPlaceholder}
          enableDefaultCategoryParent={enableDefaultCategoryParent}
          onOpenChange={(open) => !open && setSettingsTemplate(null)}
          onSaved={() => {
            setSettingsTemplate(null)
            loadTemplates()
          }}
          open={!!settingsTemplate}
          template={settingsTemplate}
          updateTemplate={updateTemplate}
        />
      ) : null}

      <ConfirmDestructive
        action="delete-template"
        open={massDeleteConfirmOpen}
        onCancel={() => { setMassDeleteConfirmOpen(false); setError(null) }}
        onConfirm={handleMassDelete}
        disabled={massDeleting}
        error={error}
        title="Delete Templates"
        description={`Are you sure you want to delete ${templateSelection.selectedCount} template${
          templateSelection.selectedCount !== 1 ? "s" : ""
        }? This cannot be undone.`}
        confirmLabel={massDeleting ? "Deleting..." : "Delete"}
      />
    </>
  )
}
