"use client"

import { useState } from "react"
import { useRouter } from "@/lib/navigation-client"

import type { ContentListItem, ContentListPageProps } from "@/components/admin/layout/content/contentListTypes"
import { showActionError } from "@/lib/utils/admin-action-feedback"

interface ContentListSelection {
  clearSelection: () => void
  remove: (id: string) => void
  selectedIds: Set<string>
}

interface UseContentListMutationsParams<TItem extends ContentListItem> {
  appendItem: (item: TItem) => void
  builderPath: string
  builderQueryParam?: string
  closeCreateDialog: () => void
  deleteItem: ContentListPageProps<TItem>["deleteItem"]
  deleteItems: ContentListPageProps<TItem>["deleteItems"]
  duplicateItem: ContentListPageProps<TItem>["duplicateItem"]
  duplicateTitle: ContentListPageProps<TItem>["duplicateTitle"]
  effectiveSiteId: string | undefined
  itemLabel: string
  itemLabelPlural: string
  itemSelection: ContentListSelection
  refreshAfterCreate: boolean
  refreshAfterDelete: boolean
  refreshAfterDuplicate: boolean
  refreshAfterUpdate: boolean
  reloadItems: () => void
  removeItem: (itemId: string) => void
  removeItems: (itemIds: Set<string>) => void
  replaceItem: (updatedItem: TItem) => void
}

export function useContentListMutations<TItem extends ContentListItem>({
  appendItem,
  builderPath,
  builderQueryParam,
  closeCreateDialog,
  deleteItem,
  deleteItems,
  duplicateItem,
  duplicateTitle,
  effectiveSiteId,
  itemLabel,
  itemLabelPlural,
  itemSelection,
  refreshAfterCreate,
  refreshAfterDelete,
  refreshAfterDuplicate,
  refreshAfterUpdate,
  reloadItems,
  removeItem,
  removeItems,
  replaceItem,
}: UseContentListMutationsParams<TItem>) {
  const router = useRouter()
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const [deletingItemId, setDeletingItemId] = useState<string | null>(null)
  const [duplicatingItemId, setDuplicatingItemId] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [massDeleting, setMassDeleting] = useState(false)
  const [massDeleteConfirmOpen, setMassDeleteConfirmOpen] = useState(false)

  function reportError(message: string) {
    setErrorMessage(message)
    showActionError(message)
  }

  async function confirmDeleteItem() {
    if (!pendingDeleteId) return

    const itemIdToDelete = pendingDeleteId
    setDeletingItemId(itemIdToDelete)

    try {
      const { success, error: deleteError } = await deleteItem(itemIdToDelete)
      if (deleteError || !success) {
        reportError(deleteError || `Failed to delete ${itemLabel.toLowerCase()}`)
        return
      }

      if (refreshAfterDelete) {
        itemSelection.remove(itemIdToDelete)
        reloadItems()
      } else {
        removeItem(itemIdToDelete)
      }
      setPendingDeleteId(null)
    } catch {
      reportError(`Failed to delete ${itemLabel.toLowerCase()}`)
    } finally {
      setDeletingItemId(null)
    }
  }

  async function confirmMassDelete() {
    setMassDeleting(true)

    try {
      const ids = Array.from(itemSelection.selectedIds)
      const idsToDelete = new Set(ids)
      const { success, error: deleteError } = await deleteItems(ids)
      if (deleteError || !success) {
        reportError(deleteError || `Failed to delete ${itemLabelPlural.toLowerCase()}`)
        return
      }

      itemSelection.clearSelection()
      if (refreshAfterDelete) {
        reloadItems()
      } else {
        removeItems(idsToDelete)
      }
      setMassDeleteConfirmOpen(false)
    } catch {
      reportError(`Failed to delete ${itemLabelPlural.toLowerCase()}`)
    } finally {
      setMassDeleting(false)
    }
  }

  async function handleDuplicate(item: TItem) {
    setDuplicatingItemId(item.id)

    try {
      const { data, error: duplicateError } = await duplicateItem(item.id, duplicateTitle(item))
      if (duplicateError) {
        reportError(`Failed to duplicate ${itemLabel.toLowerCase()}: ${duplicateError}`)
        return
      }

      if (refreshAfterDuplicate) {
        reloadItems()
      } else if (data) {
        appendItem(data)
      }
    } catch {
      reportError(`Failed to duplicate ${itemLabel.toLowerCase()}`)
    } finally {
      setDuplicatingItemId(null)
    }
  }

  function handleCreateSuccess(item: TItem, continueToBuilder?: boolean) {
    if (refreshAfterCreate) {
      reloadItems()
    } else {
      appendItem(item)
    }
    closeCreateDialog()
    if (continueToBuilder && effectiveSiteId) {
      router.push(`${builderPath}/${effectiveSiteId}?${builderQueryParam || itemLabel.toLowerCase()}=${item.slug}`)
    }
  }

  function handleItemUpdated(updatedItem: TItem) {
    replaceItem(updatedItem)
    if (refreshAfterUpdate) reloadItems()
  }

  return {
    deletingItemId,
    duplicatingItemId,
    errorMessage,
    massDeleteConfirmOpen,
    massDeleting,
    pendingDeleteId,
    confirmDeleteItem,
    confirmMassDelete,
    handleCreateSuccess,
    handleDuplicate,
    handleItemUpdated,
    setErrorMessage,
    setMassDeleteConfirmOpen,
    setPendingDeleteId,
  }
}
