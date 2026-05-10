"use client"

import { use } from "react"
import dynamic from "next/dynamic"
import { FileText, Home } from "lucide-react"

import {
  AdminModalContent,
  AdminModalDescription,
  AdminModalHeader,
  AdminModalTitle,
} from "@/components/admin/layout/builder/AdminModalLayout"
import { ContentListPage } from "@/components/admin/layout/content/ContentListPage"
import { useSiteSwitcher } from "@/components/admin/layout/providers/site-switcher-provider"
import { Badge } from "@/components/ui/badge"
import {
  deleteAccountPageAction,
  deleteAccountPagesAction,
  duplicateAccountPageAction,
  getAccountPageIdsAction,
  getAccountPagesAction,
  type AccountPage,
} from "@/lib/actions/account-pages/account-pages-actions"
import { getAccountPagePath } from "@/lib/utils/account-page-path"
import { getSiteUrl } from "@/lib/utils/site-url-generator"

const CreateAccountPageModal = dynamic(
  () =>
    import("@/components/admin/account-page-builder/layout/CreateAccountPageModal").then((m) => ({
      default: m.CreateAccountPageModal,
    })),
  { ssr: false }
)

const AccountPageSettingsModal = dynamic(
  () =>
    import("@/components/admin/account-page-builder/layout/AccountPageSettingsModal").then((m) => ({
      default: m.AccountPageSettingsModal,
    })),
  { ssr: false }
)

async function getPages(siteId: string, options?: { page?: number; pageSize?: number }) {
  const { data, total, error } = await getAccountPagesAction(siteId, options)
  return { data, categories: {}, total, error }
}

export default function AccountPagesPage({ params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = use(params)
  const { currentSite, sites } = useSiteSwitcher()
  const site = sites.find((item) => item.id === siteId) || currentSite

  return (
    <ContentListPage<AccountPage>
      breadcrumbs={[{ label: "Pages", href: `/admin/sites/${siteId}/pages` }, { label: "Account Pages" }]}
      builderPath="/admin/account-pages/builder"
      canDeleteItem={(page) => !page.is_default}
      canSelectItem={(page) => !page.is_default}
      columnCount={5}
      createButtonLabel="Create Account Page"
      deleteItem={deleteAccountPageAction}
      deleteItems={deleteAccountPagesAction}
      duplicateItem={duplicateAccountPageAction}
      duplicateTitle={(page) => `${page.title || "Page"} Copy`}
      emptyButtonLabel="Create Your First Page"
      emptyTitle={(pages, filterStatus) =>
        pages.length === 0 || filterStatus === "all" ? "No pages found" : `No ${filterStatus} pages found`
      }
      getBuilderHref={(page) => `/admin/account-pages/builder/${siteId}?page=${page.slug}`}
      getDisplayPath={(page) => getAccountPagePath(page.slug)}
      getIds={getAccountPageIdsAction}
      getItems={getPages}
      getPreviewHref={(page, previewSite) =>
        previewSite ? `${getSiteUrl(previewSite)}${getAccountPagePath(page.slug)}` : "#"
      }
      getRowIcon={(page) =>
        page.is_default ? <Home className="h-6 w-6 text-blue-600" /> : <FileText className="h-6 w-6 text-muted-foreground" />
      }
      icon={FileText}
      itemLabel="Page"
      itemLabelPlural="Pages"
      listLabel="Account Pages"
      pathPrefix=""
      previewSite={site}
      renderCreateModal={({ onCancel, onSuccess }) => (
        <AdminModalContent>
          <AdminModalHeader>
            <AdminModalTitle>Create New Account Page</AdminModalTitle>
            <AdminModalDescription>
              Add a new account page to your site. You can customize the content after creation.
            </AdminModalDescription>
          </AdminModalHeader>
          <CreateAccountPageModal siteId={siteId} onSuccess={(page) => onSuccess(page)} onCancel={onCancel} />
        </AdminModalContent>
      )}
      renderSettingsModal={({ item, onOpenChange, onSuccess, open }) => (
        <AccountPageSettingsModal open={open} onOpenChange={onOpenChange} page={item} site={site} onSuccess={onSuccess} />
      )}
      renderStatusBadge={(page) =>
        page.is_default ? (
          <Badge variant="default" className="bg-blue-100 text-blue-800">
            Default Page
          </Badge>
        ) : page.is_published ? (
          <Badge variant="default" className="bg-green-100 text-green-800">
            Published
          </Badge>
        ) : (
          <Badge variant="secondary">Draft</Badge>
        )
      }
      searchPlaceholder="Search account pages"
      showCategoryColumn={false}
      siteId={siteId}
    />
  )
}
