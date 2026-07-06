"use client"

import { useEffect, useState } from "react"
import dynamic from "next/dynamic"
import { FolderOpen } from "lucide-react"

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
  const { data, error } = await duplicateDirectoryAction(directoryId, title)
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

      const { data, error: loadError } = await getDirectoryByIdAction(item.id)
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
      deleteItem={deleteDirectoryAction}
      deleteItems={deleteDirectoriesAction}
      duplicateItem={duplicateDirectorySummaryAction}
      duplicateTitle={(directory) => `${directory.title || "Listing"} Copy`}
      emptyButtonLabel="Add Your First Listing"
      emptyTitle={() => "No listings found for the current filters."}
      getCursorItems={getDirectoryCursorListAction}
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
