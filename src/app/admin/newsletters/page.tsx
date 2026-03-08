"use client"

import { useState } from "react"
import { AdminLayout, AdminCard } from "@/components/admin/layout/admin-layout"
import { AdminPageHeader } from "@/components/admin/layout/dashboard/AdminPageHeader"
import { StickyHeader } from "@/components/admin/post-builder/layout/StickyHeader"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogPortal,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { CreateNewsletterModal } from "@/components/admin/newsletter-builder/layout/CreateNewsletterModal"
import { NewsletterSettingsModal } from "@/components/admin/newsletter-builder/layout/NewsletterSettingsModal"
import type { Newsletter } from "@/components/admin/newsletter-builder/layout/CreateNewsletterModal"
import { Mail, Copy, Trash2, Settings, MoreHorizontal, X } from "lucide-react"
import * as DialogPrimitive from "@radix-ui/react-dialog"

export default function NewslettersPage() {
  const [newsletters, setNewsletters] = useState<Newsletter[]>([])
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [settingsNewsletterId, setSettingsNewsletterId] = useState<string | null>(null)
  const [filterStatus, setFilterStatus] = useState<'all' | 'published' | 'draft'>('all')

  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false)
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const [errorDialogOpen, setErrorDialogOpen] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  const handleDelete = (id: string) => {
    setPendingDeleteId(id)
    setConfirmDialogOpen(true)
  }

  const confirmDelete = () => {
    if (!pendingDeleteId) return
    setNewsletters((prev) => prev.filter((n) => n.id !== pendingDeleteId))
    setConfirmDialogOpen(false)
    setPendingDeleteId(null)
  }

  const cancelDelete = () => {
    setConfirmDialogOpen(false)
    setPendingDeleteId(null)
  }

  const handleDuplicate = (id: string) => {
    const original = newsletters.find((n) => n.id === id)
    if (!original) return

    const now = new Date().toISOString()
    const duplicate: Newsletter = {
      ...original,
      id: crypto.randomUUID(),
      title: `${original.title} Copy`,
      is_published: false,
      created_at: now,
      updated_at: now,
    }
    setNewsletters((prev) => [...prev, duplicate])
  }

  const handleNewsletterUpdated = (updated: Newsletter) => {
    setNewsletters((prev) => prev.map((n) => (n.id === updated.id ? updated : n)))
  }

  const getStatusBadge = (newsletter: Newsletter) => {
    if (newsletter.is_published) {
      return <Badge variant="default" className="bg-green-100 text-green-800">Published</Badge>
    }
    return <Badge variant="secondary">Draft</Badge>
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

  const filteredNewsletters = newsletters.filter((n) => {
    if (filterStatus === 'published') return n.is_published
    if (filterStatus === 'draft') return !n.is_published
    return true
  })

  const statusCounts = {
    all: newsletters.length,
    published: newsletters.filter((n) => n.is_published).length,
    draft: newsletters.filter((n) => !n.is_published).length,
  }

  return (
    <>
      <StickyHeader
        breadcrumbItems={[
          { href: "/admin", label: "Dashboard" },
          { label: "Newsletters", isPage: true },
        ]}
      />
      <AdminLayout>
        <div className="w-full">
          <AdminPageHeader
            title="Newsletters"
            subtitle="Manage your newsletter content"
            primaryAction={{
              label: "Create Newsletter",
              onClick: () => setShowCreateDialog(true),
            }}
          />

          <AdminCard>
            <div className="p-6 border-b">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-semibold">
                  {`${filteredNewsletters.length} newsletter${filteredNewsletters.length !== 1 ? 's' : ''} ${filterStatus === 'all' ? 'total' : filterStatus}`}
                </h3>
                <Tabs value={filterStatus} onValueChange={(value) => setFilterStatus(value as 'all' | 'published' | 'draft')}>
                  <TabsList className="gap-1">
                    <TabsTrigger value="all">All ({statusCounts.all})</TabsTrigger>
                    <TabsTrigger value="published">Published ({statusCounts.published})</TabsTrigger>
                    <TabsTrigger value="draft">Draft ({statusCounts.draft})</TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
            </div>

            {/* Table Header */}
            <div className="px-6 py-4 border-b bg-muted/30">
              <div className="grid grid-cols-6 gap-4 text-sm font-medium text-muted-foreground">
                <div className="col-span-3">Newsletter</div>
                <div>Status</div>
                <div>Modified</div>
                <div>Actions</div>
              </div>
            </div>

            <div className="divide-y divide-muted/80">
              {filteredNewsletters.length === 0 ? (
                <div className="p-8 text-center">
                  <Mail className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                  <p className="text-muted-foreground mb-4">
                    {newsletters.length === 0
                      ? 'No newsletters found'
                      : `No ${filterStatus === 'all' ? '' : filterStatus} newsletters found`}
                  </p>
                  <Button onClick={() => setShowCreateDialog(true)} variant="outline">
                    Create Your First Newsletter
                  </Button>
                </div>
              ) : (
                filteredNewsletters.map((newsletter) => (
                  <div key={newsletter.id} className="p-6">
                    <div className="grid grid-cols-6 gap-4 items-center">
                      <div className="col-span-3">
                        <div className="flex items-center space-x-4">
                          <div className="w-12 h-12 bg-muted rounded flex items-center justify-center">
                            <Mail className="h-6 w-6 text-muted-foreground" />
                          </div>
                          <div>
                            <h4 className="font-medium">{newsletter.title}</h4>
                            {newsletter.subtitle && (
                              <p className="text-sm text-muted-foreground">{newsletter.subtitle}</p>
                            )}
                          </div>
                        </div>
                      </div>
                      <div>{getStatusBadge(newsletter)}</div>
                      <div>
                        <span className="text-sm text-muted-foreground">
                          {formatDate(newsletter.updated_at)}
                        </span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0"
                          onClick={() => setSettingsNewsletterId(newsletter.id)}
                          title="Newsletter Settings"
                        >
                          <Settings className="h-4 w-4" />
                          <span className="sr-only">Newsletter Settings</span>
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                              <MoreHorizontal className="h-4 w-4" />
                              <span className="sr-only">Open menu</span>
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-48">
                            <DropdownMenuLabel>Actions</DropdownMenuLabel>
                            <DropdownMenuItem
                              onClick={() => setSettingsNewsletterId(newsletter.id)}
                              className="flex items-center"
                            >
                              <Settings className="mr-2 h-4 w-4" />
                              Settings
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() => handleDuplicate(newsletter.id)}
                              className="flex items-center"
                            >
                              <Copy className="mr-2 h-4 w-4" />
                              Duplicate
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => handleDelete(newsletter.id)}
                              className="flex items-center text-red-600 focus:text-red-600"
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Delete
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

          {/* Create Newsletter Dialog */}
          <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
            <DialogPortal>
              <div
                className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center overflow-y-auto p-4"
                onClick={(e) => e.target === e.currentTarget && setShowCreateDialog(false)}
              >
                <div
                  className="bg-background rounded-lg border shadow-lg w-[840px] max-w-[95vw] p-10 relative my-8"
                  style={{ width: '840px', maxWidth: '95vw' }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <DialogPrimitive.Close className="absolute top-4 right-4 rounded-xs opacity-70 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-offset-2 focus:outline-hidden">
                    <X className="h-4 w-4" />
                    <span className="sr-only">Close</span>
                  </DialogPrimitive.Close>
                  <DialogHeader className="mb-6">
                    <DialogTitle>Create New Newsletter</DialogTitle>
                  </DialogHeader>
                  <CreateNewsletterModal
                    onSuccess={(newsletter) => {
                      setNewsletters((prev) => [...prev, newsletter])
                      setShowCreateDialog(false)
                    }}
                    onCancel={() => setShowCreateDialog(false)}
                  />
                </div>
              </div>
            </DialogPortal>
          </Dialog>

          {/* Newsletter Settings Modal */}
          <NewsletterSettingsModal
            open={settingsNewsletterId !== null}
            onOpenChange={(open) => setSettingsNewsletterId(open ? settingsNewsletterId : null)}
            newsletter={newsletters.find((n) => n.id === settingsNewsletterId) || null}
            onSuccess={handleNewsletterUpdated}
          />

          {/* Confirmation Dialog */}
          {confirmDialogOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center">
              <div className="fixed inset-0 bg-black/50" onClick={cancelDelete} />
              <div className="relative bg-background rounded-lg border shadow-lg p-6 w-full max-w-lg z-50">
                <h2 className="text-lg font-semibold mb-2">Delete Newsletter</h2>
                <p className="text-sm text-muted-foreground mb-4">
                  Are you sure you want to delete this newsletter? This action cannot be undone.
                </p>
                <div className="flex justify-end gap-2">
                  <Button onClick={cancelDelete} variant="outline">
                    Cancel
                  </Button>
                  <Button onClick={confirmDelete} variant="destructive">
                    Delete
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Error Dialog */}
          {errorDialogOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center">
              <div className="fixed inset-0 bg-black/50" onClick={() => setErrorDialogOpen(false)} />
              <div className="relative bg-background rounded-lg border shadow-lg p-6 w-full max-w-lg z-50">
                <h2 className="text-lg font-semibold mb-2">Error</h2>
                <p className="text-sm text-muted-foreground mb-4">{errorMessage}</p>
                <div className="flex justify-end">
                  <Button onClick={() => setErrorDialogOpen(false)} variant="default">
                    OK
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </AdminLayout>
    </>
  )
}
