"use client"

import { use } from "react"
import dynamic from "@/lib/dynamic"
import FileText from "lucide-react/dist/esm/icons/file-text.js"
import Home from "lucide-react/dist/esm/icons/house.js"

import { ContentListPage } from "@/components/admin/layout/content/ContentListPage"
import { useSiteSwitcher } from "@/components/admin/layout/providers/site-switcher-provider"
import { Badge } from "@/components/ui/badge"
import {
  deletePageAction,
  deletePagesAction,
  duplicatePageAction,
  getSitePagesAction,
  type Page,
} from "@/lib/actions/pages/page-actions"
import { getSiteUrl } from "@/lib/utils/site-url-generator"

const CreatePageModal = dynamic(
  () => import("@/components/admin/page-builder/layout/CreatePageModal").then((m) => ({ default: m.CreatePageModal })),
  { ssr: false }
)

const PageSettingsModal = dynamic(
  () =>
    import("@/components/admin/page-builder/layout/PageSettingsModal").then((m) => ({ default: m.PageSettingsModal })),
  { ssr: false }
)

async function getPages(siteId: string, options?: { page?: number; pageSize?: number }) {
  const { data, total, error } = await getSitePagesAction({ data: { siteId: siteId, options: options } })
  return { data, categories: {}, total, error }
}

export default function SitePagesPage({ params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = use(params)
  const { currentSite, sites } = useSiteSwitcher()
  const site = sites.find((item) => item.id === siteId) || currentSite

  return (
    <ContentListPage<Page>
      builderPath="/admin/pages"
      canDeleteItem={(page) => !page.is_homepage}
      canSelectItem={(page) => !page.is_homepage}
      columnCount={5}
      createButtonLabel="Create Page"
      destructiveAction="delete-page"
      deleteItem={((a0) => deletePageAction({ data: { pageId: a0 } }))}
      deleteItems={((a0) => deletePagesAction({ data: { pageIds: a0 } }))}
      duplicateItem={((a0, a1) => duplicatePageAction({ data: { pageId: a0, newTitle: a1 } }))}
      duplicateTitle={(page) => `${page.title || "Page"} Copy`}
      emptyButtonLabel="Create Your First Page"
      emptyTitle={(pages, filterStatus) =>
        pages.length === 0 || filterStatus === "all" ? "No pages found" : `No ${filterStatus} pages found`
      }
      getBuilderHref={(page) => `/admin/pages/${siteId}?page=${page.slug}`}
      getDisplayPath={(page) => `/${page.slug}`}
      getItems={getPages}
      getPreviewHref={(page, previewSite) => (previewSite ? `${getSiteUrl(previewSite)}/${page.slug}` : "#")}
      getRowIcon={(page) =>
        page.is_homepage ? <Home className="h-6 w-6 text-blue-600" /> : <FileText className="h-6 w-6 text-muted-foreground" />
      }
      icon={FileText}
      itemLabel="Page"
      itemLabelPlural="Pages"
      listLabel="Pages"
      pathPrefix=""
      previewSite={site}
      renderCreateModal={({ onCancel, onSuccess }) => (
        <CreatePageModal siteId={siteId} onSuccess={(page) => onSuccess(page)} onCancel={onCancel} />
      )}
      renderSettingsModal={({ item, onOpenChange, onSuccess, open }) => (
        <PageSettingsModal open={open} onOpenChange={onOpenChange} page={item} site={site} onSuccess={onSuccess} />
      )}
      renderStatusBadge={(page) =>
        page.is_homepage ? (
          <Badge variant="default" className="bg-blue-100 text-blue-800 dark:bg-blue-950/50 dark:text-blue-300">
            Homepage
          </Badge>
        ) : page.is_published ? (
          <Badge variant="default" className="bg-green-100 text-green-800 dark:bg-green-950/50 dark:text-green-300">
            Published
          </Badge>
        ) : (
          <Badge variant="secondary">Draft</Badge>
        )
      }
      searchPlaceholder="Search pages"
      showCategoryColumn={false}
      siteId={siteId}
    />
  )
}
