"use client"

import { useEffect, useState } from "react"
import Link from "@/components/app-link"
import { useRouter } from "@/lib/navigation-client"
import Pencil from "lucide-react/dist/esm/icons/pencil.js"
import Plus from "lucide-react/dist/esm/icons/plus.js"
import Trash2 from "lucide-react/dist/esm/icons/trash-2.js"
import { AdminLayout } from "@/components/admin/layout/admin-layout"
import {
  TableRightActions,
  TableRightActionsButton,
  TableRightActionsSearch
} from "@/components/admin/layout/content/table-right-actions"
import { DashboardSubheader } from "@/components/admin/layout/dashboard/DashboardSubheader"
import { StickyHeader } from "@/components/admin/layout/stickybar/StickyHeader"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { AdminTableShell, AdminListPending, AdminTableSummaryFooter, ConfirmDestructive } from "@/components/admin/layout/list"
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useSiteSwitcher } from "@/components/admin/layout/providers/site-switcher-provider"
import { countDirectoryCustomFields } from "@/lib/actions/directories/directory-custom-blocks/utils"
import type { DirectoryCustomBlockTemplate } from "@/lib/actions/directories/directory-custom-blocks/types"
import { deleteDirectoryCustomBlock, getDirectoryCustomBlocksBySite } from "@/lib/actions/directories/directory-custom-block-actions"
import { showActionSuccess } from "@/lib/utils/admin-action-feedback"

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
  const [templateToDelete, setTemplateToDelete] = useState<DirectoryCustomBlockTemplate | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
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
      const { data, error: loadError } = await getDirectoryCustomBlocksBySite({ data: { siteId: activeSiteId } })

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
    const { success, error: deleteError } = await deleteDirectoryCustomBlock({ data: { templateId: template.id } })

    if (!success) {
      setDeleteError(deleteError || "Failed to delete custom block")
      setDeletingId(null)
      return
    }

    setTemplates((prev) => prev.filter((item) => item.id !== template.id))
    setDeletingId(null)
    setTemplateToDelete(null)
    showActionSuccess("Custom block deleted.")
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
          <DashboardSubheader items={[{ label: "Directory", href: "/admin/directory" }, { label: "Custom Blocks" }]} />

          <AdminTableShell
            title="Custom Blocks"
            icon={<Pencil className="text-muted-foreground" />}
            count={filteredTemplates.length}
            loading={loading}
            controls={
              <TableRightActions>
                <TableRightActionsSearch
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Search custom blocks"
                />
                <TableRightActionsButton onClick={() => router.push("/admin/directory/custom-blocks/new")}>
                  <Plus className="h-4 w-4" />
                  <span className="hidden sm:inline">Create Custom Block</span>
                </TableRightActionsButton>
              </TableRightActions>
            }
            footer={!loading ? <AdminTableSummaryFooter count={filteredTemplates.length} label="custom blocks" /> : null}
          >
            <ScrollArea className="w-full">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead column="main">Block</TableHead>
                    <TableHead column="meta">Layout</TableHead>
                    <TableHead column="meta">Fields</TableHead>
                    <TableHead column="meta">Used In</TableHead>
                    <TableHead column="meta">Modified</TableHead>
                    <TableHead column="meta">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading && filteredTemplates.length === 0 ? (
                    <AdminListPending />
                  ) : filteredTemplates.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="h-32 text-center text-sm text-muted-foreground">
                        {normalizedSearchQuery
                          ? "No custom blocks match your search."
                          : "Create your first custom block to make it available in the directory builder."}
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredTemplates.map((template) => (
                      <TableRow key={template.id} className="group">
                        <TableCell column="main">
                          <div className="min-w-0 space-y-1">
                            <div className="flex items-center gap-3">
                              <Link href={`/admin/directory/custom-blocks/${template.id}`} className="font-medium hover:underline">
                                {template.name}
                              </Link>
                              {template.used_in_count ? <Badge variant="secondary">Active</Badge> : null}
                            </div>
                            <p className="truncate text-xs text-muted-foreground">/custom-blocks/{template.slug}</p>
                          </div>
                        </TableCell>
                        <TableCell column="mutedMeta">{LAYOUT_LABELS[template.layout]}</TableCell>
                        <TableCell column="mutedMeta">{countDirectoryCustomFields(template.fields)}</TableCell>
                        <TableCell column="mutedMeta">{template.used_in_count || 0}</TableCell>
                        <TableCell column="mutedMeta">
                          {template.updated_at ? new Date(template.updated_at).toLocaleDateString() : "-"}
                        </TableCell>
                        <TableCell column="meta">
                          <div className="flex items-center gap-1">
                            <Button asChild variant="ghost" size="sm" className="h-8 w-8 p-0">
                              <Link href={`/admin/directory/custom-blocks/${template.id}`}>
                                <Pencil className="h-3.5 w-3.5" />
                                <span className="sr-only">Edit {template.name}</span>
                              </Link>
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0"
                              disabled={deletingId === template.id || (template.used_in_count || 0) > 0}
                              onClick={() => {
                                setDeleteError(null)
                                setTemplateToDelete(template)
                              }}
                              aria-label={`Delete ${template.name}`}
                              title={(template.used_in_count || 0) > 0 ? "Block is in use" : `Delete ${template.name}`}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
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

          {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
          <ConfirmDestructive
            action="delete-directory-custom-block"
            open={templateToDelete !== null}
            title={`Delete “${templateToDelete?.name ?? "custom block"}”?`}
            description="This permanently removes the custom block template. Blocks currently in use cannot be deleted."
            disabled={deletingId !== null}
            error={deleteError}
            onCancel={() => {
              setTemplateToDelete(null)
              setDeleteError(null)
            }}
            onConfirm={() => templateToDelete ? handleDelete(templateToDelete) : undefined}
          />
        </div>
      </AdminLayout>
    </>
  )
}
