"use client"

import { useState } from "react"
import type { Category } from "@/lib/actions/categories/category-actions"
import { deleteCategoryAction } from "@/lib/actions/categories/category-actions"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import Edit from "lucide-react/dist/esm/icons/square-pen.js"
import Trash2 from "lucide-react/dist/esm/icons/trash-2.js"
import Eye from "lucide-react/dist/esm/icons/eye.js"
import EyeOff from "lucide-react/dist/esm/icons/eye-off.js"
import Tag from "lucide-react/dist/esm/icons/tag.js"
import Settings from "lucide-react/dist/esm/icons/settings.js"
import ChevronRight from "lucide-react/dist/esm/icons/chevron-right.js"
import Link from "@/components/app-link"
import { ConfirmDestructive } from "@/components/admin/layout/ConfirmDestructive"
import { CategorySettingsModal } from "./CategorySettingsModal"
import { Checkbox } from "@/components/ui/checkbox"
import { TableCell, TableRow } from "@/components/ui/table"
import { showActionError } from "@/lib/utils/admin-action-feedback"

interface CategoryTreeProps {
  categories: Category[]
  allCategories: Category[]
  assignmentCounts: Record<string, number>
  childCounts: Record<string, number>
  parentPath: Category[]
  siteId: string
  onCategoryDeleted: (categoryId: string) => void
  onCategoryUpdated: (category: Category) => void
  selectedIds?: Set<string>
  onToggleSelect?: (categoryId: string) => void
}

export function CategoryTree({
  categories,
  allCategories,
  assignmentCounts,
  childCounts,
  parentPath,
  siteId,
  onCategoryDeleted,
  onCategoryUpdated,
  selectedIds,
  onToggleSelect
}: CategoryTreeProps) {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [categoryToDelete, setCategoryToDelete] = useState<Category | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [settingsModalOpen, setSettingsModalOpen] = useState(false)
  const [categoryToEdit, setCategoryToEdit] = useState<Category | null>(null)

  const handleDeleteClick = (category: Category) => {
    setDeleteError(null)
    setCategoryToDelete(category)
    setDeleteDialogOpen(true)
  }

  const handleDeleteConfirm = async () => {
    if (!categoryToDelete) return

    setIsDeleting(true)
    const { success, error } = await deleteCategoryAction({ data: { categoryId: categoryToDelete.id } })

    if (success) {
      onCategoryDeleted(categoryToDelete.id)
      setDeleteDialogOpen(false)
      setCategoryToDelete(null)
    } else {
      const message = error || 'Failed to delete category'
      setDeleteError(message)
      showActionError(message)
    }
    setIsDeleting(false)
  }

  const handleSettingsClick = (category: Category) => {
    setCategoryToEdit(category)
    setSettingsModalOpen(true)
  }

  const handleSettingsSuccess = (updatedCategory: Category) => {
    onCategoryUpdated(updatedCategory)
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

  const getCategoryHref = (category: Category) => {
    if ((childCounts[category.id] || 0) > 0) {
      return `/admin/categories/${siteId}?parent=${encodeURIComponent(category.slug)}`
    }

    return `/admin/categories/builder/${siteId}?category=${category.slug}`
  }

  return (
    <>
      {categories.map((category) => {
        const childCount = childCounts[category.id] || 0

        return (
          <TableRow
            key={category.id}
            data-state={selectedIds?.has(category.id) ? "selected" : undefined}
            className="group"
          >
          <TableCell column="select">
            {onToggleSelect && (
              <Checkbox
                checked={selectedIds?.has(category.id) ?? false}
                onCheckedChange={() => onToggleSelect(category.id)}
                aria-label={`Select ${category.title}`}
              />
            )}
          </TableCell>
          <TableCell column="main">
            <Link
              href={getCategoryHref(category)}
              className="flex min-w-0 items-center space-x-4 transition-opacity hover:opacity-80"
            >
              {category.featured_image ? (
                <div className="h-10 w-10 shrink-0 overflow-hidden rounded bg-muted">
                  <img
                    src={category.featured_image}
                    alt={category.title}
                    className="h-full w-full object-cover"
                  />
                </div>
              ) : (
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-primary/10">
                  <Tag className="h-5 w-5 text-primary" />
                </div>
              )}
              <div className="min-w-0">
                <div className="flex min-w-0 items-center gap-2">
                  <h4 className="truncate text-sm font-medium hover:underline sm:text-base">{category.title}</h4>
                  {childCount > 0 ? (
                    <Badge variant="secondary" className="hidden sm:inline-flex">
                      {childCount} {childCount === 1 ? "child" : "children"}
                    </Badge>
                  ) : null}
                </div>
                <p className="truncate text-xs text-muted-foreground sm:text-sm">
                  {category.meta_description || 'No meta description'}
                </p>
              </div>
            </Link>
          </TableCell>
          <TableCell column="content">
            {parentPath.length > 0 ? (
              <div className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
                {parentPath.map((parent, index) => (
                  <span key={parent.id} className="inline-flex min-w-0 items-center gap-1">
                    {index > 0 && <ChevronRight className="h-3 w-3 shrink-0" />}
                    <span className="truncate">{parent.title}</span>
                  </span>
                ))}
              </div>
            ) : (
              <span className="text-sm text-muted-foreground">Top-level</span>
            )}
          </TableCell>
          <TableCell column="meta">
            {category.is_published ? (
              <span className="inline-flex items-center gap-1 rounded bg-green-50 px-2 py-1 text-xs text-green-600">
                <Eye className="h-3 w-3" />
                Published
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded bg-gray-100 px-2 py-1 text-xs text-gray-600">
                <EyeOff className="h-3 w-3" />
                Draft
              </span>
            )}
          </TableCell>
          <TableCell column="mutedMeta">{assignmentCounts[category.id] || 0}</TableCell>
          <TableCell column="mutedMeta">{formatDate(category.updated_at)}</TableCell>
          <TableCell column="meta">
            <div className="flex items-center space-x-2">
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
                onClick={() => handleSettingsClick(category)}
              >
                <Settings className="w-4 h-4" />
                <span className="sr-only">Settings</span>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
                asChild
              >
                <Link href={`/admin/categories/builder/${siteId}?category=${category.slug}`}>
                  <Edit className="w-4 h-4" />
                  <span className="sr-only">Edit</span>
                </Link>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 text-foreground hover:text-foreground"
                onClick={() => handleDeleteClick(category)}
              >
                <Trash2 className="h-4 w-4" />
                <span className="sr-only">Delete</span>
              </Button>
            </div>
          </TableCell>
          </TableRow>
        )
      })}

      <CategorySettingsModal
        open={settingsModalOpen}
        onOpenChange={setSettingsModalOpen}
        category={categoryToEdit}
        existingCategories={allCategories}
        onSuccess={handleSettingsSuccess}
      />

      <ConfirmDestructive
        action="delete-category"
        open={deleteDialogOpen}
        title={`Delete “${categoryToDelete?.title ?? "category"}”?`}
        description="This permanently deletes the category and every category nested beneath it."
        disabled={isDeleting}
        error={deleteError}
        impactRequest={categoryToDelete ? { ids: [categoryToDelete.id], siteId, target: "category" } : undefined}
        onCancel={() => {
          setDeleteDialogOpen(false)
          setCategoryToDelete(null)
          setDeleteError(null)
        }}
        onConfirm={handleDeleteConfirm}
      />
    </>
  )
}
