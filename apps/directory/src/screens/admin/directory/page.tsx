"use client"

import { useEffect, useState } from "react"
import dynamic from "@/lib/dynamic"
import FolderOpen from "lucide-react/dist/esm/icons/folder-open.js"

import { ContentListPage } from "@/components/admin/layout/content/ContentListPage"
import { AdminErrorDialog } from "@/components/admin/layout/list"
import {
  deleteDirectoriesAction,
  deleteDirectoryAction,
  duplicateDirectoryAction,
  getDirectoryByIdAction,
  type Directory,
} from "@/lib/actions/directories/directory-actions"
import { getDirectoryCursorListAction, type DirectorySummary } from "@/lib/actions/directories/directory-list-actions"

const CreateDirectoryModal = dynamic(
  () =>
    import("@/components/admin/directory-builder/layout/CreateDirectoryModal").then((m) => ({
      default: m.CreateDirectoryModal,
    })),
  { ssr: false }
)

const DirectorySettingsModal = dynamic(
  () =>
    import("@/components/admin/directory-builder/layout/DirectorySettingsModal").then((m) => ({
      default: m.DirectorySettingsModal,
    })),
  { ssr: false }
)

function toDirectorySummary(directory: Directory): DirectorySummary {
  return {
    id: directory.id,
    site_id: directory.site_id,
    title: directory.title,
    slug: directory.slug,
    status: directory.status,
    display_order: directory.display_order,
    featured_image: directory.featured_image,
    meta_description: directory.meta_description,
    created_at: directory.created_at,
    updated_at: directory.updated_at,
  }
}

async function duplicateDirectorySummaryAction(directoryId: string, title: string) {
  const { data, error } = await duplicateDirectoryAction({ data: { directoryId: directoryId, newTitle: title } })
  return { data: data ? toDirectorySummary(data) : null, error }
}

function DirectorySettingsBridge({
  item,
  onOpenChange,
  onSuccess,
  open,
}: {
  item: DirectorySummary | null
  onOpenChange: (open: boolean) => void
  onSuccess: (item: DirectorySummary) => void
  open: boolean
}) {
  const [directory, setDirectory] = useState<Directory | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function loadDirectory() {
      if (!open || !item?.id) {
        setDirectory(null)
        return
      }

      const { data, error: loadError } = await getDirectoryByIdAction({ data: { directoryId: item.id } })
      if (cancelled) return

      if (loadError || !data) {
        setError(loadError || "Failed to load directory settings")
        setDirectory(null)
        return
      }

      setDirectory(data)
    }

    void loadDirectory()

    return () => {
      cancelled = true
    }
  }, [item?.id, open])

  return (
    <>
      <DirectorySettingsModal
        open={open}
        onOpenChange={onOpenChange}
        directory={directory}
        site={null}
        onSuccess={(updatedDirectory) => {
          setDirectory(updatedDirectory)
          onSuccess(toDirectorySummary(updatedDirectory))
        }}
      />
      <AdminErrorDialog
        open={error !== null}
        message={error ?? ""}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setError(null)
        }}
      />
    </>
  )
}

export default function DirectoriesPage() {
  return (
    <ContentListPage<DirectorySummary>
      builderPath="/admin/directory/builder"
      builderQueryParam="directory"
      createButtonLabel="Add Listing"
      deletionImpactTarget="listing"
      deleteItem={((a0) => deleteDirectoryAction({ data: { directoryId: a0 } }))}
      deleteItems={((a0) => deleteDirectoriesAction({ data: { directoryIds: a0 } }))}
      destructiveAction="delete-listing"
      duplicateItem={duplicateDirectorySummaryAction}
      duplicateTitle={(directory) => `${directory.title || "Listing"} Copy`}
      emptyButtonLabel="Add Your First Listing"
      emptyTitle={() => "No listings found for the current filters."}
      getCursorItems={((a0) => getDirectoryCursorListAction({ data: { params: a0 } }))}
      getIsPublished={(directory) => directory.status === "published"}
      icon={FolderOpen}
      itemLabel="Listing"
      itemLabelPlural="Listings"
      listLabel="Directory"
      pathPrefix="directory"
      refreshAfterCreate
      refreshAfterDelete
      refreshAfterDuplicate
      refreshAfterUpdate
      renderCreateModal={({ onCancel, onSuccess }) => (
        <CreateDirectoryModal
          onSuccess={(directory, continueToBuilder) => onSuccess(toDirectorySummary(directory), continueToBuilder)}
          onCancel={onCancel}
        />
      )}
      renderSettingsModal={({ item, onOpenChange, onSuccess, open }) => (
        <DirectorySettingsBridge item={item} open={open} onOpenChange={onOpenChange} onSuccess={onSuccess} />
      )}
      searchPlaceholder="Search Directory"
      showClearSortAction
      showEmptyButtonWhenFiltered
      showTotalCount
      sortableColumns={{ category: false, status: false }}
    />
  )
}
