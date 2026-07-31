"use client"

import { useState, useEffect, useCallback } from "react"
import Link from "@/components/app-link"
import { useRouter, useSearchParams } from "@/lib/navigation-client"
import { AdminLayout } from "@/components/admin/layout/admin-layout"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog } from "@/components/ui/dialog"
import {
  DashboardModalContent,
  DashboardModalFooterActions
} from "@/components/admin/layout/dashboard/modals"
import { SiteDashboard } from "@/components/admin/layout/dashboard/SiteDashboard"
import { StylingSettingsCard } from "@/components/admin/layout/settings/StylingSettingsCard"
import {
  AdminSortButton,
  AdminTableShell, AdminListPending,
  AdminListFooter,
  formatRelativeDate as formatDate,
  useAdminSort
} from "@/components/admin/layout/list"
import { ConfirmDestructive } from "@/components/admin/layout/ConfirmDestructive"
import {
  TableRightActions,
  TableRightActionsButton,
  TableRightActionsSearch,
  TableRightActionsSelectTrigger
} from "@/components/admin/layout/content/table-right-actions"

import Eye from "lucide-react/dist/esm/icons/eye.js"
import Settings from "lucide-react/dist/esm/icons/settings.js"
import Trash2 from "lucide-react/dist/esm/icons/trash-2.js"
import Globe from "lucide-react/dist/esm/icons/globe.js"
import Plus from "lucide-react/dist/esm/icons/plus.js"
import Copy from "lucide-react/dist/esm/icons/copy.js"
import { DashboardSubheader } from "@/components/admin/layout/dashboard/DashboardSubheader"
import { StickyHeader } from "@/components/admin/layout/stickybar/StickyHeader"
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"
import { Select, SelectContent, SelectItem, SelectValue } from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table"
import {
  getAllSitesAction,
  deleteSiteAction,
  cloneSiteAction,
  createSiteAction,
  updateSiteAction,
  type SiteWithTheme
} from "@/lib/actions/sites/site-actions"
import { applyThemeToSiteAction, getTemplateSitesAction } from "@/lib/actions/themes/user-theme-actions"
import { getSiteUrl } from "@/lib/utils/site-url-generator"
import { useSiteSwitcher } from "@/components/admin/layout/providers/site-switcher-provider"
import { useResetPageOnListChange } from "@/lib/use-reset-page"
import { showActionError, showActionSuccess } from "@/lib/utils/admin-action-feedback"

type FilterStatus = "all" | "active" | "inactive" | "draft"
type TagFilter = "all-tags" | "untagged" | string
type SiteSortColumn = "name" | "created" | "status"

function getSiteTag(site: SiteWithTheme) {
  return typeof site.settings?.site_tag === "string" ? site.settings.site_tag.trim() : ""
}

export default function SitesPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { refreshSites, pageSize } = useSiteSwitcher()
  const [sites, setSites] = useState<SiteWithTheme[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<FilterStatus>("all")
  const [tagFilter, setTagFilter] = useState<TagFilter>("all-tags")
  const [searchQuery, setSearchQuery] = useState("")
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<{
    id: string
    name: string
  } | null>(null)
  // Duplicate flow keeps its own state so cloning cannot interfere with delete/edit actions.
  const [duplicateConfirm, setDuplicateConfirm] = useState<{
    id: string
    name: string
  } | null>(null)
  const [duplicateName, setDuplicateName] = useState("")
  const [duplicateSettings, setDuplicateSettings] = useState(true)
  const [duplicatePages, setDuplicatePages] = useState(true)
  const [duplicating, setDuplicating] = useState(false)
  const [duplicateError, setDuplicateError] = useState<string | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const siteSort = useAdminSort<SiteSortColumn>()

  const reportDuplicateError = (message: string) => {
    setDuplicateError(message)
    showActionError(message)
  }

  useEffect(() => {
    if (searchParams.get("create") === "1") {
      setShowCreateModal(true)
      // Consume the param so later search changes can't re-open the modal.
      router.replace("/admin/sites")
    }
  }, [router, searchParams])

  const loadSites = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      const { data, error } = await getAllSitesAction()

      if (error) {
        setError(error)
        return
      }

      if (data) {
        setSites(data)
      }
    } catch (err) {
      setError("Failed to load sites")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadSites()
  }, [loadSites])

  const handleDelete = async (siteId: string) => {
    try {
      setDeleting(siteId)
      const { success, error } = await deleteSiteAction(siteId)

      if (error) {
        showActionError(error)
        return
      }

      if (success) {
        setSites((prev) => prev.filter((site) => site.id !== siteId))
        await refreshSites()
        setDeleteConfirm(null)
        showActionSuccess("Site deleted.")
      }
    } catch (err) {
      showActionError("Failed to delete site")
    } finally {
      setDeleting(null)
    }
  }

  const handleCreatedSite = async (site: SiteWithTheme) => {
    setSites((prev) => [site, ...prev.filter((item) => item.id !== site.id)])
    localStorage.setItem("selectedSiteId", site.id)
    await refreshSites()
    showActionSuccess("Site created.")
    router.push(`/admin/pages/${site.id}`)
  }

  // Start each duplicate from the original name and default to copying the safe site surface.
  const openDuplicateDialog = (site: SiteWithTheme) => {
    setDuplicateConfirm({ id: site.id, name: site.name })
    setDuplicateName(`${site.name} Copy`)
    setDuplicateSettings(true)
    setDuplicatePages(true)
    setDuplicateError(null)
  }

  // Keep the modal locked while the server action is creating the clone.
  const closeDuplicateDialog = () => {
    if (duplicating) return
    setDuplicateConfirm(null)
    setDuplicateName("")
    setDuplicateError(null)
  }

  const handleDuplicate = async () => {
    if (!duplicateConfirm) return

    const name = duplicateName.trim()
    if (!name) {
      reportDuplicateError("Site name is required")
      return
    }

    try {
      setDuplicating(true)
      setDuplicateError(null)

      // The server action owns the transaction and decides exactly what can be copied.
      const { data, error } = await cloneSiteAction(duplicateConfirm.id, {
        name,
        clone_settings: duplicateSettings,
        clone_pages: duplicatePages
      })

      if (error || !data) {
        reportDuplicateError(error || "Failed to duplicate site")
        return
      }

      await loadSites()
      await refreshSites()
      setDuplicateConfirm(null)
      setDuplicateName("")
      showActionSuccess("Site duplicated.")
    } catch {
      reportDuplicateError("Failed to duplicate site")
    } finally {
      setDuplicating(false)
    }
  }

  const normalizedSearchQuery = searchQuery.trim().toLowerCase()
  const filteredSites = sites.filter((site) => {
    const tag = getSiteTag(site)
    const statusMatch = filter === "all" || site.status === filter
    const tagMatch = tagFilter === "all-tags" || (tagFilter === "untagged" ? !tag : tag === tagFilter)
    const searchText = `${site.name} ${site.subdomain} ${site.status} ${tag}`.toLowerCase()
    const searchMatch = !normalizedSearchQuery || searchText.includes(normalizedSearchQuery)

    return statusMatch && tagMatch && searchMatch
  })

  const sortedSites = [...filteredSites].sort((a, b) => {
    if (!siteSort.sortColumn) return 0
    const dir = siteSort.sortDirection === "asc" ? 1 : -1
    if (siteSort.sortColumn === "name") return a.name.localeCompare(b.name) * dir
    if (siteSort.sortColumn === "created") return (new Date(a.created_at).getTime() - new Date(b.created_at).getTime()) * dir
    if (siteSort.sortColumn === "status") return a.status.localeCompare(b.status) * dir
    return 0
  })

  // Searching, filtering or re-sorting from a later page would otherwise land
  // you past the end of the shorter result.
  useResetPageOnListChange(
    setCurrentPage,
    `${normalizedSearchQuery}|${filter}|${tagFilter}|${siteSort.sortColumn}|${siteSort.sortDirection}`
  )

  const pagedSites = sortedSites.slice((currentPage - 1) * pageSize, currentPage * pageSize)

  const siteCounts = {
    all: sites.length,
    active: sites.filter((site) => site.status === "active").length,
    inactive: sites.filter((site) => site.status === "inactive").length,
    draft: sites.filter((site) => site.status === "draft").length
  }

  const siteTags = Array.from(new Set(sites.map(getSiteTag).filter(Boolean))).sort((a, b) => a.localeCompare(b))
  const untaggedCount = sites.filter((site) => !getSiteTag(site)).length

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "active":
        return <Badge className="bg-green-100 text-green-800 dark:bg-green-950/50 dark:text-green-300">Active</Badge>
      case "inactive":
        return <Badge variant="destructive">Inactive</Badge>
      case "draft":
        return <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-950/50 dark:text-yellow-300">Draft</Badge>
      default:
        return <Badge variant="secondary">{status}</Badge>
    }
  }

  return (
    <>
      <StickyHeader />
      <AdminLayout>
        <div className="w-full">
          <DashboardSubheader
            items={[{ label: "Sites" }]}
          />

          <AdminTableShell
            error={error ? { message: error, onRetry: loadSites } : null}
            title="Sites"
            icon={<Globe className="text-muted-foreground" />}
            count={filteredSites.length}
            loading={loading}
            controls={
              <TableRightActions>
                <TableRightActionsSearch
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Search sites"
                />
                <Select value={filter} onValueChange={(value) => setFilter(value as FilterStatus)}>
                  <TableRightActionsSelectTrigger aria-label="Site status filter">
                    <SelectValue />
                  </TableRightActionsSelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All ({siteCounts.all})</SelectItem>
                    <SelectItem value="active">Active ({siteCounts.active})</SelectItem>
                    <SelectItem value="inactive">Inactive ({siteCounts.inactive})</SelectItem>
                    <SelectItem value="draft">Draft ({siteCounts.draft})</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={tagFilter} onValueChange={setTagFilter}>
                  <TableRightActionsSelectTrigger aria-label="Site tag filter">
                    <SelectValue />
                  </TableRightActionsSelectTrigger>
                  <SelectContent>
                    <SelectItem value="all-tags">All Tags</SelectItem>
                    {siteTags.map((tag) => (
                      <SelectItem key={tag} value={tag}>{tag}</SelectItem>
                    ))}
                    {untaggedCount > 0 && <SelectItem value="untagged">Untagged ({untaggedCount})</SelectItem>}
                  </SelectContent>
                </Select>
                <TableRightActionsButton onClick={() => setShowCreateModal(true)}>
                  <Plus className="h-4 w-4" />
                  <span className="hidden sm:inline">Create Site</span>
                </TableRightActionsButton>
              </TableRightActions>
            }
            footer={!loading ? <AdminListFooter currentPage={currentPage} pageSize={pageSize} total={filteredSites.length} onPageChange={setCurrentPage} /> : null}
          >

            <ScrollArea className="w-full">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead column="main">
                      <AdminSortButton
                        active={siteSort.sortColumn === "name"}
                        direction={siteSort.sortDirection}
                        onClick={() => siteSort.toggleSort("name")}
                      >
                        Site
                      </AdminSortButton>
                    </TableHead>
                    <TableHead column="meta">User</TableHead>
                    <TableHead column="meta">
                      <AdminSortButton
                        active={siteSort.sortColumn === "created"}
                        direction={siteSort.sortDirection}
                        onClick={() => siteSort.toggleSort("created")}
                      >
                        Created
                      </AdminSortButton>
                    </TableHead>
                    <TableHead column="meta">
                      <AdminSortButton
                        active={siteSort.sortColumn === "status"}
                        direction={siteSort.sortDirection}
                        onClick={() => siteSort.toggleSort("status")}
                      >
                        Status
                      </AdminSortButton>
                    </TableHead>
                    <TableHead column="meta">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading && sortedSites.length === 0 ? (
                    <AdminListPending />
                  ) : filteredSites.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="h-32 text-center">
                        <Globe className="mx-auto mb-4 h-10 w-10 text-muted-foreground" />
                        <p className="mb-4 text-muted-foreground">
                          {normalizedSearchQuery || filter !== "all" || tagFilter !== "all-tags" ? "No sites found matching your search." : "No sites found"}
                        </p>
                        <Button onClick={() => setShowCreateModal(true)} variant="outline">
                          Create Your First Site
                        </Button>
                      </TableCell>
                    </TableRow>
                  ) : (
                    pagedSites.map((site) => (
                      <TableRow key={site.id} className="group">
                        <TableCell column="main">
                          <Link
                            href={`/admin/dashboard/${site.id}`}
                            className="flex min-w-0 items-center space-x-4 transition-opacity hover:opacity-80"
                          >
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded bg-muted">
                              {site.settings?.favicon ? (
                                <img
                                  src={site.settings.favicon}
                                  alt={`${site.name} favicon`}
                                  className="h-full w-full object-contain"
                                />
                              ) : (
                                <Globe className="h-5 w-5 text-muted-foreground" />
                              )}
                            </div>
                            <div className="min-w-0">
                              <div className="flex min-w-0 items-center gap-2">
                                <h4 className="truncate text-sm font-medium hover:underline sm:text-base" title={site.name}>{site.name}</h4>
                                {getSiteTag(site) && <Badge variant="secondary">{getSiteTag(site)}</Badge>}
                              </div>
                              <p className="truncate text-xs text-muted-foreground sm:text-sm" title={site.custom_domain || site.subdomain}>{site.custom_domain || site.subdomain}</p>
                            </div>
                          </Link>
                        </TableCell>
                        <TableCell column="meta">
                          <div className="flex items-center space-x-2">
                            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100">
                              <span className="text-xs font-medium text-blue-600">Y</span>
                            </div>
                            <span className="text-sm">You</span>
                          </div>
                        </TableCell>
                        <TableCell column="mutedMeta">{formatDate(site.created_at)}</TableCell>
                        <TableCell column="meta">{getStatusBadge(site.status)}</TableCell>
                        <TableCell column="meta">
                          <div className="flex items-center space-x-1">
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" asChild>
                              <a href={getSiteUrl(site)} target="_blank" rel="noopener noreferrer" title="Preview Site">
                                <Eye className="h-4 w-4" />
                                <span className="sr-only">Preview Site</span>
                              </a>
                            </Button>
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" asChild>
                              <Link href={`/admin/settings?site=${site.id}`} title="Site Settings">
                                <Settings className="h-4 w-4" />
                                <span className="sr-only">Site Settings</span>
                              </Link>
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0"
                              onClick={() => openDuplicateDialog(site)}
                              disabled={duplicating}
                              title="Duplicate Site"
                            >
                              <Copy className="h-4 w-4" />
                              <span className="sr-only">Duplicate Site</span>
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0 text-foreground hover:text-foreground"
                              onClick={() => { setError(null); setDeleteConfirm({ id: site.id, name: site.name }) }}
                              disabled={deleting === site.id}
                              title="Delete"
                            >
                              <Trash2 className="h-4 w-4" />
                              <span className="sr-only">Delete</span>
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
        </div>

        <ConfirmDestructive
          action="delete-site"
          open={Boolean(deleteConfirm)}
          title={`Delete site ${deleteConfirm?.name || ""}?`}
          confirmationName={deleteConfirm?.name}
          disabled={!!deleting}
          error={error}
          confirmLabel={deleting ? "Deleting..." : "Delete"}
          impactRequest={deleteConfirm ? { ids: [deleteConfirm.id], siteId: deleteConfirm.id, target: "site" } : undefined}
          onCancel={() => { setDeleteConfirm(null); setError(null) }}
          onConfirm={() => { if (deleteConfirm) return handleDelete(deleteConfirm.id) }}
        />

        {showCreateModal && (
          <Dialog open onOpenChange={setShowCreateModal}>
            <CreateSiteModal
              onCancel={() => setShowCreateModal(false)}
              onCreated={(site) => {
                setShowCreateModal(false)
                void handleCreatedSite(site)
              }}
            />
          </Dialog>
        )}

        {/* Site clones are draft-only and intentionally exclude business/runtime data. */}
        {duplicateConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="fixed inset-0 bg-black/50" onClick={closeDuplicateDialog} />
            <div className="relative bg-background rounded-lg border shadow-lg p-6 w-full max-w-lg z-50">
              <h2 className="text-lg font-semibold mb-2">Duplicate Site</h2>
              <p className="text-sm text-muted-foreground mb-4">
                Create a draft copy of <strong>{duplicateConfirm.name}</strong>. Contacts, orders, events, newsletter
                activity, domains, and integrations are not copied.
              </p>

              <div className="space-y-4">
                <div>
                  <Label htmlFor="duplicate-site-name">New site name</Label>
                  <Input
                    id="duplicate-site-name"
                    value={duplicateName}
                    onChange={(event) => setDuplicateName(event.target.value)}
                    disabled={duplicating}
                  />
                </div>

                <div className="space-y-3">
                  <Label>Copy</Label>
                  <div className="flex items-start gap-3 rounded-md border p-3 text-sm">
                    <Checkbox
                      id="duplicate-site-settings"
                      checked={duplicateSettings}
                      onCheckedChange={(checked) => setDuplicateSettings(checked === true)}
                      disabled={duplicating}
                    />
                    <span>
                      <Label htmlFor="duplicate-site-settings" className="block font-medium">
                        Site settings
                      </Label>
                      <span className="block text-muted-foreground">
                        Branding, layout, typography, and public site settings.
                      </span>
                    </span>
                  </div>
                  <div className="flex items-start gap-3 rounded-md border p-3 text-sm">
                    <Checkbox
                      id="duplicate-site-pages"
                      checked={duplicatePages}
                      onCheckedChange={(checked) => setDuplicatePages(checked === true)}
                      disabled={duplicating}
                    />
                    <span>
                      <Label htmlFor="duplicate-site-pages" className="block font-medium">
                        Pages
                      </Label>
                      <span className="block text-muted-foreground">
                        Page titles, slugs, metadata, order, and content blocks.
                      </span>
                    </span>
                  </div>
                </div>

                {duplicateError && <p className="text-sm text-destructive">{duplicateError}</p>}
              </div>

              <div className="flex justify-end gap-2 mt-6">
                <Button onClick={closeDuplicateDialog} variant="outline" disabled={duplicating}>
                  Cancel
                </Button>
                <Button onClick={handleDuplicate} disabled={duplicating}>
                  {duplicating ? "Duplicating..." : "Duplicate Site"}
                </Button>
              </div>
            </div>
          </div>
        )}
      </AdminLayout>
    </>
  )
}

function CreateSiteModal({
  onCancel,
  onCreated
}: {
  onCancel: () => void
  onCreated: (site: SiteWithTheme) => void
}) {
  const [siteName, setSiteName] = useState("")
  const [subdomain, setSubdomain] = useState("")
  const [customDomain, setCustomDomain] = useState("")
  const [status, setStatus] = useState("draft")
  const [siteTag, setSiteTag] = useState("")
  const [fontFamily, setFontFamily] = useState("playfair-display")
  const [secondaryFontFamily, setSecondaryFontFamily] = useState("inter")
  const [favicon, setFavicon] = useState("")
  const [faviconFile, setFaviconFile] = useState<File | null>(null)
  const [defaultTheme, setDefaultTheme] = useState<"system" | "light" | "dark">("system")
  const [selectedTemplateId, setSelectedTemplateId] = useState("")
  const [templates, setTemplates] = useState<SiteWithTheme[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const hasTemplate = selectedTemplateId && selectedTemplateId !== "none"
  const isCustomDomainVerificationError = /^Add TXT record .+ with value .+ before using this domain$/.test(error || "")

  const reportError = (message: string) => {
    setError(message)
    showActionError(message)
  }

  useEffect(() => {
    getTemplateSitesAction().then(({ data }) => {
      if (data) setTemplates(data)
    })
  }, [])

  const handleFaviconChange = (value: string) => {
    setFaviconFile(null)
    setFavicon(value)
  }

  const handleFaviconFileSelect = (file: File) => {
    setFaviconFile(file)

    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setFavicon(reader.result)
      }
    }
    reader.readAsDataURL(file)
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()

    if (!siteName.trim()) {
      showActionError("Site name is required")
      return
    }

    if (!subdomain.trim()) {
      showActionError("Subdomain is required")
      return
    }

    try {
      setIsSubmitting(true)
      setError(null)

      const { data, error: createError } = await createSiteAction({
        name: siteName.trim(),
        subdomain: subdomain.trim(),
        custom_domain: customDomain.trim() || undefined,
        status: status as "active" | "inactive" | "draft",
        site_tag: siteTag.trim() || undefined,
        font_family: fontFamily,
        secondary_font_family: secondaryFontFamily,
        favicon: faviconFile ? undefined : favicon || undefined,
        default_theme: defaultTheme,
        settings: {
          site_title: siteName.trim(),
          analytics_enabled: false,
          seo_enabled: true,
          site_tag: siteTag.trim() || undefined
        }
      })

      if (createError || !data) {
        showActionError(createError || "Failed to create site")
        return
      }

      if (hasTemplate) {
        const { error: themeError } = await applyThemeToSiteAction({ data: { siteId: data.id, templateId: selectedTemplateId } })
        if (themeError) {
          showActionError(`Site created but failed to apply template: ${themeError}`)
          return
        }
      }

      let createdSite = data
      if (faviconFile) {
        try {
          const formData = new FormData()
          formData.append("file", faviconFile)
          formData.append("siteId", data.id)

          const uploadResponse = await fetch("/api/media/upload", {
            method: "POST",
            body: formData
          })
          const uploadResult = await uploadResponse.json() as {
            data?: { public_url?: string }
            error?: string
          }
          const uploadedFavicon = uploadResult.data?.public_url

          if (!uploadResponse.ok || !uploadedFavicon) {
            throw new Error(uploadResult.error || "Favicon upload failed")
          }

          const { data: updatedSite, error: updateError } = await updateSiteAction(data.id, {
            settings: {
              ...(data.settings || {}),
              favicon: uploadedFavicon
            }
          })

          if (updateError || !updatedSite) {
            throw new Error(updateError || "Favicon could not be saved")
          }

          createdSite = updatedSite
        } catch (faviconError) {
          const message = faviconError instanceof Error ? faviconError.message : "Favicon upload failed"
          showActionError(`Site created, but ${message.toLowerCase()}. Add the favicon from site settings.`)
        }
      }

      onCreated(createdSite)
    } catch {
      showActionError("Failed to create site. Please try again.")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form id="create-site-form" onSubmit={handleSubmit} className="contents">
      <DashboardModalContent
        title="Create Site"
        description="Create a new site and choose its initial settings."
        footer={
          <>
            <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
              Cancel
            </Button>
            <DashboardModalFooterActions>
              <Button form="create-site-form" type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Creating..." : "Create Site"}
              </Button>
            </DashboardModalFooterActions>
          </>
        }
      >
        {error && !isCustomDomainVerificationError && (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
            {error}
          </div>
        )}

        <SiteDashboard
          siteName={siteName}
          subdomain={subdomain}
          customDomain={customDomain}
          status={status}
          siteTag={siteTag}
          customDomainError={error}
          onSiteNameChange={setSiteName}
          onSubdomainChange={setSubdomain}
          onCustomDomainChange={setCustomDomain}
          onStatusChange={setStatus}
          onSiteTagChange={setSiteTag}
        />

        {templates.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Start from Template</CardTitle>
            </CardHeader>
            <CardContent>
              <Select value={selectedTemplateId} onValueChange={setSelectedTemplateId}>
                <TableRightActionsSelectTrigger aria-label="Template">
                  <SelectValue placeholder="No template (blank site)" />
                </TableRightActionsSelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No template (blank site)</SelectItem>
                  {templates.map((template) => (
                    <SelectItem key={template.id} value={template.id}>
                      {template.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>
        )}

        {!hasTemplate && (
          <StylingSettingsCard
            fontFamily={fontFamily}
            secondaryFontFamily={secondaryFontFamily}
            favicon={favicon}
            defaultTheme={defaultTheme}
            onFontFamilyChange={setFontFamily}
            onSecondaryFontFamilyChange={setSecondaryFontFamily}
            onFaviconChange={handleFaviconChange}
            onFaviconFileSelect={handleFaviconFileSelect}
            onDefaultThemeChange={setDefaultTheme}
          />
        )}
      </DashboardModalContent>
    </form>
  )
}
