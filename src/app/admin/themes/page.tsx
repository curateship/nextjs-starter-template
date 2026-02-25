"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { AdminLayout, AdminPageHeader, AdminCard } from "@/components/admin/layout/admin-layout"
import { StickyHeader } from "@/components/admin/layout/dashboard/StickyHeader"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Trash2, MoreHorizontal, Edit, Paintbrush, Pencil } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { getTemplateSitesAction, deleteTemplateAction } from "@/lib/actions/themes/user-theme-actions"
import { createSiteAction, updateSiteAction } from "@/lib/actions/sites/site-actions"
import { ApplyThemeDialog } from "@/components/admin/themes/ApplyThemeDialog"
import type { Site } from "@/lib/actions/sites/site-actions"

export default function ThemesPage() {
  const router = useRouter()
  const [templates, setTemplates] = useState<Site[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; templateId: string; templateName: string }>({
    open: false,
    templateId: "",
    templateName: "",
  })
  const [creating, setCreating] = useState(false)
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [createName, setCreateName] = useState("")
  const [renameDialog, setRenameDialog] = useState<{ open: boolean; templateId: string; currentName: string }>({
    open: false,
    templateId: "",
    currentName: "",
  })
  const [renameName, setRenameName] = useState("")
  const [renaming, setRenaming] = useState(false)
  const [applyDialog, setApplyDialog] = useState<{ open: boolean; templateId: string; templateName: string }>({
    open: false,
    templateId: "",
    templateName: "",
  })

  const loadTemplates = async () => {
    try {
      setLoading(true)
      setError(null)
      const { data, error } = await getTemplateSitesAction()

      if (error) {
        setError(error)
        return
      }

      setTemplates(data || [])
    } catch {
      setError("Failed to load themes")
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteConfirm = async () => {
    try {
      setDeleting(deleteDialog.templateId)
      const { success, error } = await deleteTemplateAction(deleteDialog.templateId)

      if (error) {
        alert(`Failed to delete theme: ${error}`)
        return
      }

      if (success) {
        setTemplates(prev => prev.filter(t => t.id !== deleteDialog.templateId))
      }
      setDeleteDialog(prev => ({ ...prev, open: false }))
    } catch {
      alert("Failed to delete theme")
    } finally {
      setDeleting(null)
    }
  }

  const handleCreateTheme = async () => {
    const trimmed = createName.trim()
    if (!trimmed) return

    try {
      setCreating(true)
      const { data, error } = await createSiteAction({
        name: trimmed,
        is_template: true,
      })

      if (error) {
        alert(`Failed to create theme: ${error}`)
        return
      }

      if (data) {
        setCreateDialogOpen(false)
        router.push(`/admin/pages/${data.id}`)
      }
    } catch {
      alert("Failed to create theme")
    } finally {
      setCreating(false)
    }
  }

  const handleRenameSubmit = async () => {
    const trimmed = renameName.trim()
    if (!trimmed || trimmed === renameDialog.currentName) return

    try {
      setRenaming(true)
      const { error } = await updateSiteAction(renameDialog.templateId, { name: trimmed })
      if (error) {
        alert(`Failed to rename theme: ${error}`)
        return
      }
      setTemplates(prev => prev.map(t => t.id === renameDialog.templateId ? { ...t, name: trimmed } : t))
      setRenameDialog(prev => ({ ...prev, open: false }))
    } catch {
      alert("Failed to rename theme")
    } finally {
      setRenaming(false)
    }
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffTime = Math.abs(now.getTime() - date.getTime())
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))

    if (diffDays === 1) return '1 day ago'
    if (diffDays < 7) return `${diffDays} days ago`
    if (diffDays < 30) return `${Math.ceil(diffDays / 7)} weeks ago`
    return `${Math.ceil(diffDays / 30)} months ago`
  }

  useEffect(() => {
    loadTemplates()
  }, [])

  return (
    <>
      <StickyHeader
        breadcrumbItems={[
          { href: "/admin", label: "Admin" },
          { label: "Themes", isPage: true }
        ]}
      />
      <AdminLayout>
        <div className="w-full">
          <AdminPageHeader
            title="Themes"
            subtitle="Save and manage reusable site templates"
            primaryAction={{
              label: "Create Theme",
              onClick: () => { setCreateName(""); setCreateDialogOpen(true) },
            }}
          />

          <AdminCard>
            <div className="p-6 border-b">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="text-lg font-semibold">Themes List</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    {loading ? 'Loading...' : `${templates.length} theme${templates.length !== 1 ? 's' : ''} found`}
                  </p>
                </div>
              </div>
            </div>

            {/* Table Header */}
            <div className="px-6 py-4 border-b bg-muted/30">
              <div className="grid grid-cols-5 gap-4 text-sm font-medium text-muted-foreground">
                <div className="col-span-2">Theme</div>
                <div>Created</div>
                <div>Actions</div>
              </div>
            </div>

            <div className="divide-y divide-muted/80">
              {loading ? (
                <div className="space-y-0">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="p-6 border-b border-muted/80">
                      <div className="grid grid-cols-5 gap-4 items-center">
                        <div className="col-span-2">
                          <div className="flex items-center space-x-4">
                            <div className="w-12 h-12 bg-muted rounded-lg animate-pulse"></div>
                            <div>
                              <div className="h-4 bg-muted rounded animate-pulse mb-2 w-32"></div>
                              <div className="h-3 bg-muted/60 rounded animate-pulse w-24"></div>
                            </div>
                          </div>
                        </div>
                        <div>
                          <div className="h-3 bg-muted/60 rounded animate-pulse w-16"></div>
                        </div>
                        <div>
                          <div className="h-8 w-8 bg-muted rounded animate-pulse"></div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : error ? (
                <div className="p-8 text-center">
                  <p className="text-red-600 mb-4">{error}</p>
                  <Button onClick={loadTemplates} variant="outline" size="sm">
                    Try Again
                  </Button>
                </div>
              ) : templates.length === 0 ? (
                <div className="p-8 text-center">
                  <Paintbrush className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
                  <p className="text-muted-foreground mb-1">No themes yet</p>
                  <p className="text-sm text-muted-foreground">
                    Click &ldquo;Create Theme&rdquo; to start building a reusable template.
                  </p>
                </div>
              ) : (
                templates.map((template) => (
                  <div key={template.id} className="p-6">
                    <div className="grid grid-cols-5 gap-4 items-center">
                      <div className="col-span-2">
                        <Link
                          href={`/admin/pages/${template.id}`}
                          className="flex items-center space-x-4 hover:opacity-80 transition-opacity"
                        >
                          <div className="w-12 h-12 bg-gradient-to-br from-violet-500 to-purple-600 rounded-lg flex items-center justify-center">
                            <span className="text-white text-sm font-medium">
                              {template.name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2)}
                            </span>
                          </div>
                          <div>
                            <h4 className="font-medium hover:underline">{template.name}</h4>
                            <p className="text-sm text-muted-foreground">
                              {template.settings?.description || "Reusable template"}
                            </p>
                          </div>
                        </Link>
                      </div>
                      <div>
                        <span className="text-sm text-muted-foreground">
                          {formatDate(template.created_at)}
                        </span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                              <MoreHorizontal className="h-4 w-4" />
                              <span className="sr-only">Open menu</span>
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem asChild>
                              <Link href={`/admin/pages/${template.id}`} className="flex items-center">
                                <Edit className="h-4 w-4 mr-2" />
                                Edit
                              </Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onSelect={() => setApplyDialog({
                                open: true,
                                templateId: template.id,
                                templateName: template.name,
                              })}
                            >
                              <Paintbrush className="h-4 w-4 mr-2" />
                              Apply to Site
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onSelect={() => {
                                setRenameName(template.name)
                                setTimeout(() => {
                                  setRenameDialog({ open: true, templateId: template.id, currentName: template.name })
                                }, 0)
                              }}
                            >
                              <Pencil className="h-4 w-4 mr-2" />
                              Rename
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onSelect={() => {
                                setTimeout(() => {
                                  setDeleteDialog({ open: true, templateId: template.id, templateName: template.name })
                                }, 0)
                              }}
                              className="text-red-600 focus:text-red-600"
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Delete Theme
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </AdminCard>
        </div>

        <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Create Theme</DialogTitle>
              <DialogDescription>
                Enter a name for your new theme template.
              </DialogDescription>
            </DialogHeader>
            <div className="py-2">
              <Label htmlFor="create-theme-name" className="sr-only">Name</Label>
              <Input
                id="create-theme-name"
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && createName.trim()) handleCreateTheme() }}
                placeholder="Theme name"
                autoFocus
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleCreateTheme}
                disabled={creating || !createName.trim()}
              >
                {creating ? "Creating..." : "Create"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={renameDialog.open} onOpenChange={(open) => setRenameDialog(prev => ({ ...prev, open }))}>
          <DialogContent className="sm:max-w-md" onCloseAutoFocus={(e) => e.preventDefault()}>
            <DialogHeader>
              <DialogTitle>Rename Theme</DialogTitle>
              <DialogDescription>
                Enter a new name for this theme.
              </DialogDescription>
            </DialogHeader>
            <div className="py-2">
              <Label htmlFor="theme-name" className="sr-only">Name</Label>
              <Input
                id="theme-name"
                value={renameName}
                onChange={(e) => setRenameName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleRenameSubmit() }}
                placeholder="Theme name"
                autoFocus
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setRenameDialog(prev => ({ ...prev, open: false }))}>
                Cancel
              </Button>
              <Button
                onClick={handleRenameSubmit}
                disabled={renaming || !renameName.trim() || renameName.trim() === renameDialog.currentName}
              >
                {renaming ? "Saving..." : "Save"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={deleteDialog.open} onOpenChange={(open) => setDeleteDialog(prev => ({ ...prev, open }))}>
          <DialogContent className="sm:max-w-md" onCloseAutoFocus={(e) => e.preventDefault()}>
            <DialogHeader>
              <DialogTitle>Delete Theme</DialogTitle>
              <DialogDescription>
                Are you sure you want to delete &ldquo;{deleteDialog.templateName}&rdquo;? This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteDialog(prev => ({ ...prev, open: false }))}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleDeleteConfirm}
                disabled={deleting === deleteDialog.templateId}
              >
                {deleting === deleteDialog.templateId ? "Deleting..." : "Delete"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <ApplyThemeDialog
          templateId={applyDialog.templateId}
          templateName={applyDialog.templateName}
          open={applyDialog.open}
          onOpenChange={(open) => setApplyDialog(prev => ({ ...prev, open }))}
        />
      </AdminLayout>
    </>
  )
}
