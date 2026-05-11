"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Pencil, Plus, Trash2 } from "lucide-react"
import { AdminLayout } from "@/components/admin/layout/admin-layout"
import { DashboardSubheader } from "@/components/admin/layout/dashboard/DashboardSubheader"
import { StickyHeader } from "@/components/admin/layout/stickybar/StickyHeader"
import { Card, CardTableHeader } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { AdminListSkeleton } from "@/components/admin/layout/list"
import { useSiteSwitcher } from "@/components/admin/layout/providers/site-switcher-provider"
import { countDirectoryCustomFields } from "@/lib/actions/directories/directory-custom-blocks/utils"
import type { DirectoryCustomBlockTemplate } from "@/lib/actions/directories/directory-custom-blocks/types"
import {
  deleteDirectoryCustomBlock,
  getDirectoryCustomBlocksBySite
} from "@/lib/actions/directories/directory-custom-block-actions"

const LAYOUT_LABELS: Record<DirectoryCustomBlockTemplate["layout"], string> = {
  stack: "Stack",
  "stack-card": "Stack Card",
  "two-column": "Two Column"
}

export default function DirectoryCustomBlocksPage() {
  const router = useRouter()
  const { currentSite } = useSiteSwitcher()
  const [loading, setLoading] = useState(true)
  const [templates, setTemplates] = useState<DirectoryCustomBlockTemplate[]>([])
  const [error, setError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState("")

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
        setError(loadError || "Failed to load custom blocks")
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
      setError(deleteError || "Failed to delete custom block")
      setDeletingId(null)
      return
    }

    setTemplates((prev) => prev.filter((item) => item.id !== template.id))
    setDeletingId(null)
  }

  const normalizedSearchQuery = searchQuery.trim().toLowerCase()
  const filteredTemplates = normalizedSearchQuery
    ? templates.filter((template) => {
        const searchText = [template.name, template.slug, LAYOUT_LABELS[template.layout]].join(" ").toLowerCase()

        return searchText.includes(normalizedSearchQuery)
      })
    : templates

  return (
    <>
      <StickyHeader />
      <AdminLayout>
        <div className="w-full">
          <DashboardSubheader
            items={[{ label: "Directory", href: "/admin/directories" }, { label: "Custom Blocks" }]}
            search={{
              value: searchQuery,
              onValueChange: setSearchQuery,
              placeholder: "Search custom blocks"
            }}
            actions={
              <Button onClick={() => router.push("/admin/directories/custom-blocks/new")}>
                <Plus className="mr-2 h-4 w-4" />
                Create Custom Block
              </Button>
            }
          />

          <Card>
            <CardTableHeader className="grid-cols-7">
              <div className="col-span-2">Block</div>
              <div>Layout</div>
              <div>Fields</div>
              <div>Used In</div>
              <div>Modified</div>
              <div>Actions</div>
            </CardTableHeader>

            <div className="divide-y divide-muted/80">
              {loading ? (
                <AdminListSkeleton columns={7} rowCount={3} showCheckbox={false} showThumbnail={false} />
              ) : filteredTemplates.length === 0 ? (
                <div className="p-12 text-center text-sm text-muted-foreground">
                  {normalizedSearchQuery
                    ? "No custom blocks match your search."
                    : "Create your first custom block to make it available in the directory builder."}
                </div>
              ) : (
                filteredTemplates.map((template) => (
                  <div key={template.id} className="p-6">
                    <div className="grid grid-cols-7 gap-4 items-center">
                      <div className="col-span-2 min-w-0 space-y-1">
                        <div className="flex items-center gap-3">
                          <Link
                            href={`/admin/directories/custom-blocks/${template.id}`}
                            className="font-medium hover:underline"
                          >
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
                        {template.updated_at ? new Date(template.updated_at).toLocaleDateString() : "-"}
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
                          title={(template.used_in_count || 0) > 0 ? "Block is in use" : `Delete ${template.name}`}
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

          {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
        </div>
      </AdminLayout>
    </>
  )
}
