"use client"

import { useState, useEffect, useCallback } from "react"
import Link from "@/components/app-link"
import { useRouter } from "@/lib/navigation-client"
import { AdminLayout } from "@/components/admin/layout/admin-layout"
import { DashboardSubheader } from "@/components/admin/layout/dashboard/DashboardSubheader"
import { Card, CardContent, CardGroup, CardHeader } from "@/components/ui/card"
import { StickyHeader } from "@/components/admin/layout/stickybar/StickyHeader"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog } from "@/components/ui/dialog"
import {
  TableRightActions,
  TableRightActionsButton,
  TableRightActionsSearch
} from "@/components/admin/layout/content/table-right-actions"
import {
  AdminBulkDeleteButton,
  ConfirmDestructive,
  AdminListFooter,
  AdminSortButton,
  AdminTableShell, AdminListPending,
  formatShortDate as formatDate,
  useAdminBulkSelection,
  useAdminSort
} from "@/components/admin/layout/list"
import { Input } from "@/components/ui/input"
import { Field, FieldLabel } from "@/components/ui/field"
import { DashboardModalContent, DashboardModalCardTitle } from "@/components/admin/layout/dashboard/modals"
import Trash2 from "lucide-react/dist/esm/icons/trash-2.js"
import Settings from "lucide-react/dist/esm/icons/settings.js"
import FileText from "lucide-react/dist/esm/icons/file-text.js"
import Plus from "lucide-react/dist/esm/icons/plus.js"
import Star from "lucide-react/dist/esm/icons/star.js"
import { cn } from "@/lib/utils/tailwind"
import {
  getTemplatesBySite,
  createTemplate,
  deleteTemplates,
  setDefaultTemplate
} from "@/lib/actions/newsletters/template-actions"
import type { NewsletterTemplate } from "@/lib/actions/newsletters/template-actions"
import { useClearSelectionOnListChange } from "@/lib/use-clear-selection"
import { useResetPageOnListChange } from "@/lib/use-reset-page"
import { useSiteSwitcher } from "@/components/admin/layout/providers/site-switcher-provider"
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"
import { showActionSuccess } from "@/lib/utils/admin-action-feedback"
import { showErrorToast } from "@/lib/error-toast"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table"

type TemplateSortColumn = "name" | "blocks" | "modified"

export default function TemplatesPage() {
  const { currentSite, pageSize } = useSiteSwitcher()
  const router = useRouter()
  const [templates, setTemplates] = useState<NewsletterTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const templateSelection = useAdminBulkSelection()
  const [massDeleting, setMassDeleting] = useState(false)
  const [massDeleteConfirmOpen, setMassDeleteConfirmOpen] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const [total, setTotal] = useState(0)

  const templateSort = useAdminSort<TemplateSortColumn>()
  // Everything that changes what the table shows, minus the page itself.
  const listQueryKey = `${currentSite?.id}|${searchQuery}|${templateSort.sortColumn}|${templateSort.sortDirection}`
  // Searching, filtering or re-sorting from a later page would otherwise
  // land you past the end of the shorter result.
  useResetPageOnListChange(setCurrentPage, listQueryKey)
  // Ticks never survive a change to what the table is showing — the page
  // and rows-per-page included, so a bulk action only ever means rows on
  // screen.
  useClearSelectionOnListChange(templateSelection, `${listQueryKey}|${currentPage}|${pageSize}`)


  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [formName, setFormName] = useState("")
  const [formNameInvalid, setFormNameInvalid] = useState(false)
  const [creating, setCreating] = useState(false)

  const loadTemplates = useCallback(async () => {
    if (!currentSite?.id) {
      setLoading(true)
      setTemplates([])
      return
    }

    try {
      setLoading(true)
      setError(null)
      const {
        data,
        total: totalCount,
        error: loadError
      } = await getTemplatesBySite({ data: { siteId: currentSite.id, options: {
        page: currentPage,
        pageSize
      } } })
      if (loadError) {
        setError(loadError)
        setLoading(false)
        return
      }
      setTemplates(data || [])
      setTotal(totalCount)
      setLoading(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load templates")
      setLoading(false)
    }
  }, [currentSite?.id, currentPage, pageSize])

  useEffect(() => {
    loadTemplates()
  }, [loadTemplates])

  async function handleCreate() {
    if (!currentSite?.id) return
    if (!formName.trim()) {
      setFormNameInvalid(true)
      showErrorToast("Template name is required")
      return
    }

    setFormNameInvalid(false)
    setCreating(true)

    const { data, error: createError } = await createTemplate({ data: { input: {
      siteId: currentSite.id,
      name: formName.trim()
    } } })

    if (createError) {
      setError(createError)
      setCreating(false)
      return
    }

    setCreating(false)
    setCreateModalOpen(false)
    setFormName("")
    if (data) {
      showActionSuccess("Template created.")
      router.push(`/admin/newsletters/templates/${data.id}`)
    }
  }

  async function handleMassDelete() {
    setMassDeleting(true)
    const deletedCount = templateSelection.selectedCount
    const { error: deleteError } = await deleteTemplates({ data: { ids: Array.from(templateSelection.selectedIds) } })
    if (deleteError) {
      setError(deleteError)
    } else {
      templateSelection.clearSelection()
      setMassDeleteConfirmOpen(false)
      loadTemplates()
      showActionSuccess(deletedCount === 1 ? "Template deleted." : "Templates deleted.")
    }
    setMassDeleting(false)
  }

  const getBlockCount = (template: NewsletterTemplate) => {
    if (!template.content_blocks || typeof template.content_blocks !== "object") return 0
    return Object.keys(template.content_blocks).length
  }

  const normalizedSearchQuery = searchQuery.trim().toLowerCase()
  const filteredTemplates = templates.filter((template) => {
    if (!normalizedSearchQuery) return true
    return template.name.toLowerCase().includes(normalizedSearchQuery)
  })
  const filteredDeletableTemplates = filteredTemplates.filter((template) => !template.is_default)
  const filteredDeletableTemplateIds = filteredDeletableTemplates.map((template) => template.id)
  const filteredDeletableTemplatesSelected =
    filteredDeletableTemplateIds.length > 0 &&
    filteredDeletableTemplateIds.every((templateId) => templateSelection.selectedIds.has(templateId))

  const sortedTemplates = [...filteredTemplates].sort((a, b) => {
    if (!templateSort.sortColumn) return 0
    const dir = templateSort.sortDirection === "asc" ? 1 : -1
    if (templateSort.sortColumn === "name") return a.name.localeCompare(b.name) * dir
    if (templateSort.sortColumn === "blocks") return (getBlockCount(a) - getBlockCount(b)) * dir
    if (templateSort.sortColumn === "modified")
      return (new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime()) * dir
    return 0
  })

  async function handleSetDefault(templateId: string) {
    const { error: defaultError } = await setDefaultTemplate({ data: { templateId: templateId } })
    if (defaultError) {
      setError(defaultError)
    } else {
      showActionSuccess("Default template updated.")
    }
    loadTemplates()
  }

  return (
    <>
      <StickyHeader />
      <AdminLayout>
        <div className="w-full">
          <DashboardSubheader
            items={[{ label: "Newsletters", href: "/admin/newsletters" }, { label: "Templates" }]}
          />

          <AdminTableShell
            error={error ? { message: error, onRetry: () => loadTemplates() } : null}
            title="Templates"
            icon={<FileText className="text-muted-foreground" />}
            count={filteredTemplates.length}
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
                <TableRightActionsSearch
                  value={searchQuery}
                  onChange={(event) => {
                    setSearchQuery(event.target.value)
                  }}
                  placeholder="Search templates"
                />
                <TableRightActionsButton
                  onClick={() => {
                    setFormName("")
                    setCreateModalOpen(true)
                  }}
                >
                  <Plus className="h-4 w-4" />
                  <span className="hidden sm:inline">Create Template</span>
                </TableRightActionsButton>
              </TableRightActions>
            }
            footer={
              !loading ? (
                <AdminListFooter
                  currentPage={currentPage}
                  pageSize={pageSize}
                  total={total}
                  onPageChange={setCurrentPage}
                />
              ) : null
            }
          >

            <ScrollArea className="w-full">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead column="select">
                      <Checkbox
                        checked={filteredDeletableTemplatesSelected}
                        onCheckedChange={() => {
                          if (filteredDeletableTemplatesSelected) {
                            templateSelection.clearSelection()
                          } else {
                            templateSelection.selectOnly(filteredDeletableTemplateIds)
                          }
                        }}
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
                  {loading && sortedTemplates.length === 0 ? (
                    <AdminListPending />
                  ) : filteredTemplates.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="h-32 text-center">
                        <FileText className="mx-auto mb-4 h-10 w-10 text-muted-foreground" />
                        {normalizedSearchQuery ? (
                          <p className="text-muted-foreground">No templates found matching your search.</p>
                        ) : (
                          <>
                            <p className="mb-4 text-muted-foreground">
                              No templates yet. Create one to save reusable block layouts.
                            </p>
                            <Button
                              onClick={() => {
                                setFormName("")
                                setCreateModalOpen(true)
                              }}
                              variant="outline"
                            >
                              Create Template
                            </Button>
                          </>
                        )}
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
                          <Link
                            href={`/admin/newsletters/templates/${template.id}`}
                            className="transition-opacity hover:opacity-80"
                          >
                            <h4 className="truncate text-sm font-medium hover:underline sm:text-base" title={template.name}>{template.name}</h4>
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
                              onClick={() => router.push(`/admin/newsletters/templates/${template.id}`)}
                              title="Edit Template"
                            >
                              <Settings className="h-4 w-4" />
                              <span className="sr-only">Edit Template</span>
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

      {/* Create Template Modal */}
      <Dialog open={createModalOpen} onOpenChange={setCreateModalOpen}>
        <form
          id="create-template-form"
          onSubmit={(event) => {
            event.preventDefault()
            handleCreate()
          }}
          className="contents"
        >
          <DashboardModalContent
            title="Create Template"
            description="Name the template before opening it in the newsletter builder."
            footer={
              <>
                <Button type="button" variant="outline" onClick={() => setCreateModalOpen(false)} disabled={creating}>
                  Cancel
                </Button>
                <Button form="create-template-form" type="submit" disabled={creating}>
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
                      aria-invalid={formNameInvalid}
                      onChange={(e) => {
                        setFormName(e.target.value)
                        if (formNameInvalid && e.target.value.trim()) setFormNameInvalid(false)
                      }}
                      placeholder="e.g. Weekly Newsletter Layout"
                    />
                  </Field>
                </CardContent>
              </Card>
            </CardGroup>
          </DashboardModalContent>
        </form>
      </Dialog>

      <ConfirmDestructive
        action="delete-template"
        open={massDeleteConfirmOpen}
        title="Delete Templates"
        description={`Are you sure you want to delete ${templateSelection.selectedCount} template${templateSelection.selectedCount !== 1 ? "s" : ""}? This cannot be undone.`}
        confirmLabel={massDeleting ? "Deleting..." : "Delete"}
        disabled={massDeleting}
        error={error}
        onCancel={() => { setMassDeleteConfirmOpen(false); setError(null) }}
        onConfirm={handleMassDelete}
      />
    </>
  )
}
