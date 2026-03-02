"use client"

import { useState } from "react"
import type { Category } from "@/lib/actions/categories/category-actions"
import { deleteCategoryAction } from "@/lib/actions/categories/category-actions"
import { Button } from "@/components/ui/button"
import {
  Edit,
  Trash2,
  Eye,
  EyeOff,
  Tag,
  Settings,
  ChevronRight
} from "lucide-react"
import Link from "next/link"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { CategorySettingsModal } from "./CategorySettingsModal"

interface CategoryTreeProps {
  categories: Category[]
  allCategories: Category[]
  assignmentCounts: Record<string, number>
  siteId: string
  onCategoryDeleted: (categoryId: string) => void
  onCategoryUpdated: (category: Category) => void
}

export function CategoryTree({
  categories,
  allCategories,
  assignmentCounts,
  siteId,
  onCategoryDeleted,
  onCategoryUpdated
}: CategoryTreeProps) {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [categoryToDelete, setCategoryToDelete] = useState<Category | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [settingsModalOpen, setSettingsModalOpen] = useState(false)
  const [categoryToEdit, setCategoryToEdit] = useState<Category | null>(null)

  const handleDeleteClick = (category: Category) => {
    setCategoryToDelete(category)
    setDeleteDialogOpen(true)
  }

  const handleDeleteConfirm = async () => {
    if (!categoryToDelete) return

    setIsDeleting(true)
    const { success, error } = await deleteCategoryAction(categoryToDelete.id)

    if (success) {
      onCategoryDeleted(categoryToDelete.id)
      setDeleteDialogOpen(false)
      setCategoryToDelete(null)
    } else {
      alert(error || 'Failed to delete category')
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

  const getFullParentPath = (category: Category): string[] => {
    if (!category.parent_id) return []

    const path: string[] = []
    let current: Category | undefined = allCategories.find(c => c.id === category.parent_id)

    while (current) {
      path.unshift(current.title)
      current = allCategories.find(c => c.id === current?.parent_id)
    }

    return path
  }

  return (
    <>
      {categories.map((category) => (
        <div key={category.id} className="p-6">
          <div className="grid grid-cols-7 gap-4 items-center">
            <div className="col-span-2">
              <div className="flex items-center space-x-4">
                {category.featured_image ? (
                  <div className="w-10 h-10 rounded overflow-hidden flex-shrink-0 bg-muted">
                    <img
                      src={category.featured_image}
                      alt={category.title}
                      className="w-full h-full object-cover"
                    />
                  </div>
                ) : (
                  <div className="w-10 h-10 bg-primary/10 rounded flex items-center justify-center flex-shrink-0">
                    <Tag className="h-5 w-5 text-primary" />
                  </div>
                )}

                <Link
                  href={`/admin/categories/builder/${siteId}?category=${category.slug}`}
                  className="flex-1 min-w-0 hover:opacity-80 transition-opacity"
                >
                  <div className="font-medium hover:underline truncate">{category.title}</div>
                  <div className="text-sm text-muted-foreground">
                    {category.description && (
                      <div className="truncate">
                        <span dangerouslySetInnerHTML={{ __html: category.description.replace(/<[^>]*>/g, '') }} />
                      </div>
                    )}
                    {!category.description && (
                      <span>No description</span>
                    )}
                  </div>
                </Link>
              </div>
            </div>

            <div>
              {getFullParentPath(category).length > 0 ? (
                <div className="flex items-center gap-1 text-sm text-muted-foreground">
                  {getFullParentPath(category).map((parent, index) => (
                    <div key={index} className="flex items-center gap-1">
                      {index > 0 && <ChevronRight className="w-3 h-3 flex-shrink-0" />}
                      <span className="truncate">{parent}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <span className="text-sm text-muted-foreground">Top-level</span>
              )}
            </div>

            <div>
              {category.is_published ? (
                <span className="inline-flex items-center gap-1 text-xs text-green-600 bg-green-50 px-2 py-1 rounded">
                  <Eye className="w-3 h-3" />
                  Published
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-xs text-gray-600 bg-gray-100 px-2 py-1 rounded">
                  <EyeOff className="w-3 h-3" />
                  Draft
                </span>
              )}
            </div>

            <div>
              <span className="text-sm text-muted-foreground">
                {assignmentCounts[category.id] || 0}
              </span>
            </div>

            <div>
              <span className="text-sm text-muted-foreground">
                {formatDate(category.updated_at)}
              </span>
            </div>

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
                className="h-8 w-8 p-0"
                onClick={() => handleDeleteClick(category)}
              >
                <Trash2 className="w-4 h-4 text-red-600" />
                <span className="sr-only">Delete</span>
              </Button>
            </div>
          </div>
        </div>
      ))}

      <CategorySettingsModal
        open={settingsModalOpen}
        onOpenChange={setSettingsModalOpen}
        category={categoryToEdit}
        existingCategories={allCategories}
        onSuccess={handleSettingsSuccess}
      />

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Delete Category?</DialogTitle>
            <DialogDescription asChild>
              <div>
                Are you sure you want to delete &quot;{categoryToDelete?.title}&quot;?
                {(() => {
                  if (!categoryToDelete) return null
                  const countDescendants = (parentId: string): number => {
                    const children = allCategories.filter(c => c.parent_id === parentId)
                    return children.reduce((sum, child) => sum + 1 + countDescendants(child.id), 0)
                  }
                  const count = countDescendants(categoryToDelete.id)
                  if (count === 0) return null
                  return (
                    <span className="block mt-2 text-red-600 font-medium">
                      Deleting this will also delete {count} child {count === 1 ? 'category' : 'categories'}.
                    </span>
                  )
                })()}
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteConfirm}
              disabled={isDeleting}
            >
              {isDeleting ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
