"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Pencil, Plus, Trash2 } from "lucide-react"
import { AdminLayout } from "@/components/admin/layout/admin-layout"
import { getDirectoryAdminTopNavLinks } from "@/components/admin/layout/dashboard/admin-top-nav-links"
import { DashboardSubheader } from "@/components/admin/layout/dashboard/DashboardSubheader"
import { StickyHeader } from "@/components/admin/layout/dashboard/StickyHeader"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { useSiteSwitcher } from "@/components/admin/providers/site-switcher-provider"
import { countDirectoryCustomFields } from "@/lib/actions/directories/directory-custom-blocks/utils"
import type { DirectoryCustomBlockTemplate } from "@/lib/actions/directories/directory-custom-blocks/types"
import { deleteDirectoryCustomBlock, getDirectoryCustomBlocksBySite } from "@/lib/actions/directories/directory-custom-block-actions"

const LAYOUT_LABELS: Record<DirectoryCustomBlockTemplate['layout'], string> = {
  stack: 'Stack',
  'stack-card': 'Stack Card',
  'two-column': 'Two Column',
}

export default function DirectoryCustomBlocksPage() {
  const router = useRouter()
  const { currentSite } = useSiteSwitcher()
  const [loading, setLoading] = useState(true)
  const [templates, setTemplates] = useState<DirectoryCustomBlockTemplate[]>([])
  const [error, setError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  useEffect(() => {
    const siteId = currentSite?.id

    if (!siteId) {
      setTemplates([])
      setLoading(true)
      return
    }
    const activeSiteId = siteId

    let cancelled = false

    async function loadTemplates() {
      setLoading(true)
      const { data, error: loadError } = await getDirectoryCustomBlocksBySite(activeSiteId)

      if (cancelled) return

      if (loadError || !data) {
        setError(loadError || 'Failed to load custom blocks')
        setLoading(false)
        return
      }

      setTemplates(data)
      setError(null)
      setLoading(false)
    }

    loadTemplates()

    return () => {
      cancelled = true
    }
  }, [currentSite?.id])

  const handleDelete = async (template: DirectoryCustomBlockTemplate) => {
    setDeletingId(template.id)
    const { success, error: deleteError } = await deleteDirectoryCustomBlock(template.id)

    if (!success) {
      setError(deleteError || 'Failed to delete custom block')
      setDeletingId(null)
      return
    }

    setTemplates(prev => prev.filter(item => item.id !== template.id))
    setDeletingId(null)
  }

  return (
    <>
      <StickyHeader navLinks={getDirectoryAdminTopNavLinks("custom-blocks")} />
      <AdminLayout>
        <div className="w-full">
          <DashboardSubheader
            items={[
              { label: 'Directory', href: '/admin/directories' },
              { label: 'Custom Blocks' },
            ]}
            actions={(
              <Button onClick={() => router.push('/admin/directories/custom-blocks/new')}>
                <Plus className="mr-2 h-4 w-4" />
                Create Custom Block
              </Button>
            )}
          />

          <Card className="shadow-sm">
            <div className="px-6 py-4 border-b bg-muted/30">
              <div className="grid grid-cols-7 gap-4 text-sm font-medium text-muted-foreground">
                <div className="col-span-2">Block</div>
                <div>Layout</div>
                <div>Fields</div>
                <div>Used In</div>
                <div>Modified</div>
                <div>Actions</div>
              </div>
            </div>

            <div className="divide-y divide-muted/80">
              {loading ? (
                <div className="space-y-0">
                  {[1, 2, 3].map(index => (
                    <div key={index} className="border-b border-muted/80 p-6 last:border-b-0">
                      <div className="grid grid-cols-7 gap-4 items-center">
                        <div className="col-span-2 space-y-2">
                          <div className="h-4 w-40 animate-pulse rounded bg-muted" />
                          <div className="h-3 w-32 animate-pulse rounded bg-muted/60" />
                        </div>
                        <div className="h-4 w-20 animate-pulse rounded bg-muted" />
                        <div className="h-4 w-10 animate-pulse rounded bg-muted" />
                        <div className="h-4 w-10 animate-pulse rounded bg-muted" />
                        <div className="h-4 w-20 animate-pulse rounded bg-muted" />
                        <div className="flex gap-1">
                          <div className="h-8 w-8 animate-pulse rounded bg-muted" />
                          <div className="h-8 w-8 animate-pulse rounded bg-muted" />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : templates.length === 0 ? (
                <div className="p-12 text-center text-sm text-muted-foreground">
                  Create your first custom block to make it available in the directory builder.
                </div>
              ) : (
                templates.map(template => (
                  <div key={template.id} className="p-6">
                    <div className="grid grid-cols-7 gap-4 items-center">
                      <div className="col-span-2 min-w-0 space-y-1">
                        <div className="flex items-center gap-3">
                          <Link href={`/admin/directories/custom-blocks/${template.id}`} className="font-medium hover:underline">
                            {template.name}
                          </Link>
                          {template.used_in_count ? <Badge variant="secondary">Active</Badge> : null}
                        </div>
                        <p className="truncate text-xs text-muted-foreground">/custom-blocks/{template.slug}</p>
                      </div>

                      <div>{LAYOUT_LABELS[template.layout]}</div>
                      <div>{countDirectoryCustomFields(template.fields)}</div>
                      <div>{template.used_in_count || 0}</div>
                      <div className="text-sm text-muted-foreground">
                        {template.updated_at ? new Date(template.updated_at).toLocaleDateString() : '-'}
                      </div>
                      <div className="flex items-center gap-1">
                        <Button asChild variant="ghost" size="sm" className="h-8 w-8 p-0">
                          <Link href={`/admin/directories/custom-blocks/${template.id}`}>
                            <Pencil className="h-3.5 w-3.5" />
                            <span className="sr-only">Edit {template.name}</span>
                          </Link>
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0"
                          disabled={deletingId === template.id || (template.used_in_count || 0) > 0}
                          onClick={() => handleDelete(template)}
                          aria-label={`Delete ${template.name}`}
                          title={(template.used_in_count || 0) > 0 ? 'Block is in use' : `Delete ${template.name}`}
                        >
                          <Trash2 className="h-3.5 w-3.5 text-red-600" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>

          {error && (
            <p className="mt-4 text-sm text-red-600">{error}</p>
          )}
        </div>
      </AdminLayout>
    </>
  )
}
