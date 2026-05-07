"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { AdminLayout } from "@/components/admin/layout/admin-layout"
import { DashboardSubheader } from "@/components/admin/layout/dashboard/DashboardSubheader"
import { StickyHeader } from "@/components/admin/layout/stickybar/StickyHeader"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Pagination, PaginationInfo } from "@/components/ui/pagination"
import { useSiteSwitcher } from "@/components/admin/layout/providers/site-switcher-provider"
import { cn } from "@/lib/utils/tailwind"
import {
  createDirectoryTemplate,
  deleteDirectoryTemplates,
  getDirectoryTemplateIdsAction,
  getDirectoryTemplatesBySite,
  setDefaultDirectoryTemplate,
  type DirectoryTemplate,
} from "@/lib/actions/directories/directory-template-actions"
import { parseDirectoryBlocksFromJson } from "@/components/admin/directory-builder/config/directory-block-utils"
import { ArrowDown, ArrowUp, ChevronsUpDown, FileText, Settings, Star, Trash2 } from "lucide-react"

export default function DirectoryTemplatesPage() {
  const { currentSite } = useSiteSwitcher()
  const router = useRouter()
  const [templates, setTemplates] = useState<DirectoryTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [allSelected, setAllSelected] = useState(false)
  const [massDeleting, setMassDeleting] = useState(false)
  const [massDeleteConfirmOpen, setMassDeleteConfirmOpen] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const pageSize = 50
  const [total, setTotal] = useState(0)
  const [searchQuery, setSearchQuery] = useState("")

  const [sortColumn, setSortColumn] = useState<'name' | 'blocks' | 'modified' | null>(null)
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')

  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [formName, setFormName] = useState("")
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
      const { data, total: totalCount, error: loadError } = await getDirectoryTemplatesBySite(currentSite.id, { page: currentPage, pageSize })
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
  }, [currentSite?.id, currentPage])

  useEffect(() => {
    loadTemplates()
  }, [loadTemplates])

  async function handleCreate() {
    if (!currentSite?.id || !formName.trim()) return
    setCreating(true)

    const { data, error: createError } = await createDirectoryTemplate({
      siteId: currentSite.id,
      name: formName.trim(),
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
      router.push(`/admin/directories/templates/${data.id}`)
    }
  }

  async function handleMassDelete() {
    setMassDeleting(true)
    const { error: deleteError } = await deleteDirectoryTemplates(Array.from(selectedIds))
    if (deleteError) {
      setError(deleteError)
    } else {
      setSelectedIds(new Set())
      setAllSelected(false)
    }
    setMassDeleting(false)
    setMassDeleteConfirmOpen(false)
    loadTemplates()
  }

  function toggleSelect(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
        setAllSelected(false)
      } else {
        next.add(id)
      }
      return next
    })
  }

  function toggleSelectAll() {
    if (selectedIds.size === deletableTemplates.length) {
      setSelectedIds(new Set())
      setAllSelected(false)
    } else {
      setSelectedIds(new Set(deletableTemplates.map(template => template.id)))
    }
  }

  async function handleSelectAll() {
    if (!currentSite?.id || total === 0) return
    const { ids } = await getDirectoryTemplateIdsAction(currentSite.id)
    if (ids) {
      setSelectedIds(new Set(ids))
      setAllSelected(true)
    }
  }

  function handleClearSelection() {
    setSelectedIds(new Set())
    setAllSelected(false)
  }

  function toggleSort(column: 'name' | 'blocks' | 'modified') {
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

  function getSortIcon(column: 'name' | 'blocks' | 'modified') {
    if (sortColumn !== column) return <ChevronsUpDown className="h-3 w-3 opacity-70" />
    if (sortDirection === 'asc') return <ArrowUp className="h-3 w-3" />
    return <ArrowDown className="h-3 w-3" />
  }

  function getBlockCount(template: DirectoryTemplate) {
    return parseDirectoryBlocksFromJson(template.content_blocks || {}).length
  }

  const normalizedSearchQuery = searchQuery.trim().toLowerCase()
  const filteredTemplates = normalizedSearchQuery
    ? templates.filter((template) => template.name.toLowerCase().includes(normalizedSearchQuery))
    : templates

  const sortedTemplates = [...filteredTemplates].sort((a, b) => {
    if (!sortColumn) return 0
    const dir = sortDirection === 'asc' ? 1 : -1
    if (sortColumn === 'name') return a.name.localeCompare(b.name) * dir
    if (sortColumn === 'blocks') return (getBlockCount(a) - getBlockCount(b)) * dir
    if (sortColumn === 'modified') return (new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime()) * dir
    return 0
  })

  function formatDate(dateString: string) {
    const date = new Date(dateString)
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
  }

  const deletableTemplates = filteredTemplates.filter((template) => !template.is_default)
  const selectableTotal = normalizedSearchQuery ? deletableTemplates.length : Math.max(0, total - (total > 0 ? 1 : 0))

  async function handleSetDefault(templateId: string) {
    const { error: defaultError } = await setDefaultDirectoryTemplate(templateId)
    if (defaultError) {
      setError(defaultError)
    }
    setSelectedIds((prev) => {
      const next = new Set(prev)
      next.delete(templateId)
      return next
    })
    setAllSelected(false)
    loadTemplates()
  }

  return (
    <>
      <StickyHeader />
      <AdminLayout>
        <div className="w-full">
          <DashboardSubheader
            items={[
              { label: "Directory", href: "/admin/directories" },
              { label: "Templates" },
            ]}
            search={{
              value: searchQuery,
              onValueChange: (value) => {
                setSearchQuery(value)
                setSelectedIds(new Set())
                setAllSelected(false)
              },
              placeholder: "Search templates",
            }}
            actions={
              <div className="flex items-center gap-1.5 sm:gap-3">
                {selectedIds.size > 0 && (
                  <Button
                    variant="destructive"
                    onClick={() => setMassDeleteConfirmOpen(true)}
                    disabled={massDeleting}
                  >
                    {massDeleting ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                        <span className="hidden sm:inline">Deleting...</span>
                      </>
                    ) : (
                      <>
                        <Trash2 className="h-4 w-4" />
                        <span className="hidden sm:inline">Delete ({selectedIds.size})</span>
                      </>
                    )}
                  </Button>
                )}
                <Button onClick={() => { setFormName(""); setCreateModalOpen(true) }}>
                  Create Template
                </Button>
              </div>
            }
          />

          <Card className="shadow-sm">
            <div className="px-6 py-4 border-b bg-muted/30">
              <div className="grid grid-cols-5 gap-4 text-sm font-medium text-muted-foreground">
                <div className="col-span-2 flex items-center space-x-4">
                  <Checkbox
                    checked={deletableTemplates.length > 0 && deletableTemplates.every((template) => selectedIds.has(template.id))}
                    onCheckedChange={toggleSelectAll}
                    aria-label="Select all templates"
                  />
                  <button
                    type="button"
                    onClick={() => toggleSort('name')}
                    className={cn(
                      "flex items-center gap-1.5",
                      "text-[0.8125rem] text-muted-foreground hover:text-foreground",
                      "cursor-pointer outline-none transition-colors"
                    )}
                  >
                    <span>Name</span>
                    <span className="ml-2 flex h-3.5 w-3.5 items-center justify-center">{getSortIcon('name')}</span>
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => toggleSort('blocks')}
                  className={cn(
                    "flex items-center gap-1.5",
                    "text-[0.8125rem] text-muted-foreground hover:text-foreground",
                    "cursor-pointer outline-none transition-colors"
                  )}
                >
                  <span>Blocks</span>
                  <span className="ml-2 flex h-3.5 w-3.5 items-center justify-center">{getSortIcon('blocks')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => toggleSort('modified')}
                  className={cn(
                    "flex items-center gap-1.5",
                    "text-[0.8125rem] text-muted-foreground hover:text-foreground",
                    "cursor-pointer outline-none transition-colors"
                  )}
                >
                  <span>Modified</span>
                  <span className="ml-2 flex h-3.5 w-3.5 items-center justify-center">{getSortIcon('modified')}</span>
                </button>
                <div>Actions</div>
              </div>
            </div>

            {deletableTemplates.length > 0 && selectedIds.size === deletableTemplates.length && selectableTotal > deletableTemplates.length && (
              <div className="px-6 py-2 bg-accent/50 border-b text-sm text-center">
                {allSelected ? (
                  <span>All {selectableTotal} items selected. <button type="button" onClick={handleClearSelection} className="underline hover:text-foreground text-muted-foreground">Clear selection</button></span>
                ) : (
                  <span>{deletableTemplates.length} items on this page are selected. <button type="button" onClick={handleSelectAll} className="underline font-medium">Select all {selectableTotal}</button></span>
                )}
              </div>
            )}

            <div className="divide-y divide-muted/80">
              {loading ? (
                <div className="space-y-0">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <div key={i} className="p-6 border-b border-muted/80">
                      <div className="grid grid-cols-5 gap-4 items-center">
                        <div className="col-span-2 flex items-center space-x-4">
                          <div className="w-4 h-4 bg-muted rounded animate-pulse" />
                          <div className="h-4 bg-muted rounded animate-pulse w-40" />
                        </div>
                        <div><div className="h-4 bg-muted/60 rounded animate-pulse w-12" /></div>
                        <div><div className="h-3 bg-muted/60 rounded animate-pulse w-20" /></div>
                        <div className="flex gap-1">
                          <div className="h-8 w-8 bg-muted rounded animate-pulse" />
                          <div className="h-8 w-8 bg-muted rounded animate-pulse" />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : error ? (
                <div className="p-8 text-center">
                  <p className="text-red-600 mb-4">{error}</p>
                  <Button onClick={() => loadTemplates()} variant="outline" size="sm">Try Again</Button>
                </div>
              ) : filteredTemplates.length === 0 ? (
                <div className="p-8 text-center">
                  <FileText className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                  <p className="text-muted-foreground mb-4">
                    {normalizedSearchQuery ? "No templates match your search." : "No templates yet. Create one to save reusable block layouts."}
                  </p>
                  <Button onClick={() => { setFormName(""); setCreateModalOpen(true) }} variant="outline">
                    Create Template
                  </Button>
                </div>
              ) : (
                sortedTemplates.map((template) => (
                  <div key={template.id} className={`p-6 transition-colors ${selectedIds.has(template.id) ? "bg-accent/50" : ""}`}>
                    <div className="grid grid-cols-5 gap-4 items-center">
                      <div className="col-span-2 flex items-center space-x-4">
                        <Checkbox
                          checked={selectedIds.has(template.id)}
                          onCheckedChange={() => toggleSelect(template.id)}
                          aria-label={`Select ${template.name}`}
                          disabled={template.is_default}
                        />
                        <Link
                          href={`/admin/directories/templates/${template.id}`}
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
                          onClick={() => router.push(`/admin/directories/templates/${template.id}`)}
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
                              setSelectedIds(new Set([template.id]))
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

            {!loading && total > 0 && (
              <div className="flex items-center justify-between px-6 py-4 border-t">
                <PaginationInfo currentPage={currentPage} pageSize={pageSize} total={total} />
                <Pagination
                  currentPage={currentPage}
                  totalPages={Math.ceil(total / pageSize)}
                  onPageChange={(page) => { setCurrentPage(page); setSelectedIds(new Set()); setAllSelected(false) }}
                  showFirstLast={false}
                />
              </div>
            )}
          </Card>
        </div>
      </AdminLayout>

      <Dialog open={createModalOpen} onOpenChange={setCreateModalOpen}>
        <DialogContent className="w-[480px] max-w-[95vw] p-10" style={{ width: '480px', maxWidth: '95vw' }}>
          <DialogHeader className="mb-6">
            <DialogTitle>Create Template</DialogTitle>
          </DialogHeader>
          <div className="space-y-6">
            <div>
              <Label htmlFor="template-name">Name *</Label>
              <Input
                id="template-name"
                value={formName}
                onChange={(event) => setFormName(event.target.value)}
                placeholder="e.g. Featured Listing Layout"
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    handleCreate()
                  }
                }}
              />
            </div>
            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={() => setCreateModalOpen(false)} disabled={creating}>
                Cancel
              </Button>
              <Button onClick={handleCreate} disabled={creating || !formName.trim()}>
                {creating ? "Creating..." : "Create Template"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {massDeleteConfirmOpen && (
        <div className="fixed inset-0 z-60 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/50" onClick={() => setMassDeleteConfirmOpen(false)} />
          <div className="relative bg-background rounded-lg border shadow-lg p-6 w-full max-w-lg z-60">
            <h2 className="text-lg font-semibold mb-2">Delete Templates</h2>
            <p className="text-sm text-muted-foreground mb-4">
              Are you sure you want to delete {selectedIds.size} template{selectedIds.size !== 1 ? "s" : ""}? This cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <Button onClick={() => setMassDeleteConfirmOpen(false)} variant="outline">Cancel</Button>
              <Button onClick={handleMassDelete} variant="destructive" disabled={massDeleting}>
                {massDeleting ? "Deleting..." : "Delete"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
