"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { AdminLayout } from "@/components/admin/layout/admin-layout"
import { DashboardSubheader } from "@/components/admin/layout/dashboard/DashboardSubheader"
import { Card, CardContent, CardGroup, CardHeader, CardTableHeader } from "@/components/ui/card"
import { StickyHeader } from "@/components/admin/layout/stickybar/StickyHeader"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog } from "@/components/ui/dialog"
import {
  AdminBulkDeleteButton,
  AdminConfirmDialog,
  AdminListFooter,
  AdminListSkeleton,
  AdminSelectionBanner,
  AdminSortButton,
  formatShortDate as formatDate,
  useAdminBulkSelection,
  useAdminSort
} from "@/components/admin/layout/list"
import { Input } from "@/components/ui/input"
import { Field, FieldLabel } from "@/components/ui/field"
import { DashboardModalContent, DashboardModalCardTitle } from "@/components/admin/layout/dashboard/modals"
import { Trash2, Settings, FileText, Star } from "lucide-react"
import { cn } from "@/lib/utils/tailwind"
import {
  getTemplatesBySite,
  createTemplate,
  deleteTemplates,
  getTemplateIdsAction,
  setDefaultTemplate
} from "@/lib/actions/newsletters/template-actions"
import type { NewsletterTemplate } from "@/lib/actions/newsletters/template-actions"
import { useSiteSwitcher } from "@/components/admin/layout/providers/site-switcher-provider"

type TemplateSortColumn = "name" | "blocks" | "modified"

export default function TemplatesPage() {
  const { currentSite } = useSiteSwitcher()
  const router = useRouter()
  const [templates, setTemplates] = useState<NewsletterTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const templateSelection = useAdminBulkSelection()
  const [massDeleting, setMassDeleting] = useState(false)
  const [massDeleteConfirmOpen, setMassDeleteConfirmOpen] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const pageSize = 50
  const [total, setTotal] = useState(0)

  const templateSort = useAdminSort<TemplateSortColumn>()

  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [formName, setFormName] = useState("")
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    loadTemplates()
  }, [currentSite?.id, currentPage])

  async function loadTemplates() {
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
      } = await getTemplatesBySite(currentSite.id, {
        page: currentPage,
        pageSize
      })
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
  }

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
      router.push(`/admin/newsletters/templates/${data.id}`)
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

  // Select all items across all pages (lightweight ID-only fetch)
  const handleSelectAll = async () => {
    if (!currentSite?.id || total === 0) return
    const { ids } = await getTemplateIdsAction(currentSite.id)
    if (ids) {
      templateSelection.selectAll(ids)
    }
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
    const { error: defaultError } = await setDefaultTemplate(templateId)
    if (defaultError) {
      setError(defaultError)
    }
    loadTemplates()
  }

  return (
    <>
      <StickyHeader />
      <AdminLayout>
        <div className="w-full">
          {/* Breadcrumb navigation + action buttons */}
          <DashboardSubheader
            items={[{ label: "Newsletters", href: "/admin/newsletters" }, { label: "Templates" }]}
            search={{
              value: searchQuery,
              onValueChange: (value) => {
                setSearchQuery(value)
                templateSelection.clearSelection()
              },
              placeholder: "Search templates"
            }}
            actions={
              <div className="flex items-center gap-1.5 sm:gap-3">
                <AdminBulkDeleteButton
                  deleting={massDeleting}
                  onClick={() => setMassDeleteConfirmOpen(true)}
                  selectedCount={templateSelection.selectedCount}
                />
                <Button
                  onClick={() => {
                    setFormName("")
                    setCreateModalOpen(true)
                  }}
                >
                  Create Template
                </Button>
              </div>
            }
          />

          <Card>
            <CardTableHeader className="grid-cols-5">
              <div className="col-span-2 flex items-center space-x-4">
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
                <AdminSortButton
                  active={templateSort.sortColumn === "name"}
                  direction={templateSort.sortDirection}
                  onClick={() => templateSort.toggleSort("name")}
                >
                  Name
                </AdminSortButton>
              </div>
              <AdminSortButton
                active={templateSort.sortColumn === "blocks"}
                direction={templateSort.sortDirection}
                onClick={() => templateSort.toggleSort("blocks")}
              >
                Blocks
              </AdminSortButton>
              <AdminSortButton
                active={templateSort.sortColumn === "modified"}
                direction={templateSort.sortDirection}
                onClick={() => templateSort.toggleSort("modified")}
              >
                Modified
              </AdminSortButton>
              <div>Actions</div>
            </CardTableHeader>

            {/* "Select all" banner — shown when all page items selected but more exist */}
            {!normalizedSearchQuery && (
              <AdminSelectionBanner
                allSelected={templateSelection.allSelected}
                onClearSelection={templateSelection.clearSelection}
                onSelectAll={handleSelectAll}
                selectedCount={templateSelection.selectedCount}
                total={total}
                visibleCount={templates.length}
              />
            )}

            <div className="divide-y divide-muted/80">
              {loading ? (
                <AdminListSkeleton columns={5} showThumbnail={false} />
              ) : error ? (
                <div className="p-8 text-center">
                  <p className="text-red-600 mb-4">{error}</p>
                  <Button onClick={() => loadTemplates()} variant="outline" size="sm">
                    Try Again
                  </Button>
                </div>
              ) : filteredTemplates.length === 0 ? (
                <div className="p-8 text-center">
                  <FileText className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                  <p className="text-muted-foreground mb-4">
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
                </div>
              ) : (
                sortedTemplates.map((template) => (
                  <div
                    key={template.id}
                    className={`p-6 transition-colors ${templateSelection.selectedIds.has(template.id) ? "bg-accent/50" : ""}`}
                  >
                    <div className="grid grid-cols-5 gap-4 items-center">
                      <div className="col-span-2 flex items-center space-x-4">
                        {/* Default templates can't be selected for deletion */}
                        <Checkbox
                          checked={templateSelection.selectedIds.has(template.id)}
                          onCheckedChange={() => templateSelection.toggleOne(template.id)}
                          aria-label={`Select ${template.name}`}
                          disabled={template.is_default}
                        />
                        <Link
                          href={`/admin/newsletters/templates/${template.id}`}
                          className="hover:opacity-80 transition-opacity"
                        >
                          <h4 className="font-medium text-sm hover:underline">{template.name}</h4>
                        </Link>
                      </div>
                      <div>
                        <span className="text-sm text-muted-foreground">{getBlockCount(template)}</span>
                      </div>
                      <div>
                        <span className="text-sm text-muted-foreground">{formatDate(template.updated_at)}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        {/* Set as default */}
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
                        {/* Default templates can't be deleted */}
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
                    </div>
                  </div>
                ))
              )}
            </div>
            {!loading && (
              <AdminListFooter
                currentPage={currentPage}
                pageSize={pageSize}
                total={total}
                onPageChange={(page) => {
                  setCurrentPage(page)
                  templateSelection.clearSelection()
                }}
              />
            )}
          </Card>
        </div>
      </AdminLayout>

      {/* Create Template Modal */}
      <Dialog open={createModalOpen} onOpenChange={setCreateModalOpen}>
        <form
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
                <Button type="submit" disabled={creating || !formName.trim()}>
                  {creating ? "Creating..." : "Create Template"}
                </Button>
              </>
            }
          >
            <CardGroup className="grid">
              <Card>
                <CardHeader className="p-4 pb-3">
                  <DashboardModalCardTitle>Template</DashboardModalCardTitle>
                </CardHeader>
                <CardContent className="grid gap-4 p-4 pt-0">
                  <Field>
                    <FieldLabel htmlFor="template-name">Name *</FieldLabel>
                    <Input
                      id="template-name"
                      value={formName}
                      onChange={(e) => setFormName(e.target.value)}
                      placeholder="e.g. Weekly Newsletter Layout"
                    />
                  </Field>
                </CardContent>
              </Card>
            </CardGroup>
          </DashboardModalContent>
        </form>
      </Dialog>

      <AdminConfirmDialog
        open={massDeleteConfirmOpen}
        title="Delete Templates"
        description={`Are you sure you want to delete ${templateSelection.selectedCount} template${templateSelection.selectedCount !== 1 ? "s" : ""}? This cannot be undone.`}
        confirmLabel={massDeleting ? "Deleting..." : "Delete"}
        disabled={massDeleting}
        onCancel={() => setMassDeleteConfirmOpen(false)}
        onConfirm={handleMassDelete}
      />
    </>
  )
}
