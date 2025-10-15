"use client"

import { useState } from "react"
import type { Taxonomy } from "@/lib/actions/taxonomies/taxonomy-actions"
import type { TaxonomyType } from "@/lib/actions/taxonomies/taxonomy-type-actions"
import { deleteTaxonomyAction } from "@/lib/actions/taxonomies/taxonomy-actions"
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { TaxonomySettingsModal } from "./TaxonomySettingsModal"

interface TaxonomyTreeProps {
  taxonomies: Taxonomy[]
  allTaxonomies: Taxonomy[]
  taxonomyType: TaxonomyType
  siteId: string
  onTaxonomyDeleted: (taxonomyId: string) => void
  onTaxonomyUpdated: (taxonomy: Taxonomy) => void
}

export function TaxonomyTree({
  taxonomies,
  allTaxonomies,
  taxonomyType,
  siteId,
  onTaxonomyDeleted,
  onTaxonomyUpdated
}: TaxonomyTreeProps) {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [taxonomyToDelete, setTaxonomyToDelete] = useState<Taxonomy | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [settingsModalOpen, setSettingsModalOpen] = useState(false)
  const [taxonomyToEdit, setTaxonomyToEdit] = useState<Taxonomy | null>(null)

  const handleDeleteClick = (taxonomy: Taxonomy) => {
    setTaxonomyToDelete(taxonomy)
    setDeleteDialogOpen(true)
  }

  const handleDeleteConfirm = async () => {
    if (!taxonomyToDelete) return

    setIsDeleting(true)
    const { success, error } = await deleteTaxonomyAction(taxonomyToDelete.id)

    if (success) {
      onTaxonomyDeleted(taxonomyToDelete.id)
      setDeleteDialogOpen(false)
      setTaxonomyToDelete(null)
    } else {
      alert(error || 'Failed to delete taxonomy')
    }
    setIsDeleting(false)
  }

  const handleSettingsClick = (taxonomy: Taxonomy) => {
    setTaxonomyToEdit(taxonomy)
    setSettingsModalOpen(true)
  }

  const handleSettingsSuccess = (updatedTaxonomy: Taxonomy) => {
    onTaxonomyUpdated(updatedTaxonomy)
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

  const getParentName = (parentId: string | null) => {
    if (!parentId) return null
    const parent = allTaxonomies.find(t => t.id === parentId)
    return parent?.title || null
  }

  const getFullParentPath = (taxonomy: Taxonomy): string[] => {
    if (!taxonomy.parent_id) return []

    const path: string[] = []
    let current: Taxonomy | undefined = allTaxonomies.find(t => t.id === taxonomy.parent_id)

    // Build path from immediate parent to root
    while (current) {
      path.unshift(current.title)
      current = allTaxonomies.find(t => t.id === current?.parent_id)
    }

    return path
  }

  return (
    <>
      {/* Flat list of all terms */}
      {taxonomies.map((taxonomy) => (
        <div key={taxonomy.id} className="p-6">
          <div className="grid grid-cols-6 gap-4 items-center">
            {/* Term Column (col-span-2) */}
            <div className="col-span-2">
              <div className="flex items-center space-x-4">
                {taxonomy.featured_image ? (
                  <div className="w-10 h-10 rounded overflow-hidden flex-shrink-0 bg-muted">
                    <img
                      src={taxonomy.featured_image}
                      alt={taxonomy.title}
                      className="w-full h-full object-cover"
                    />
                  </div>
                ) : (
                  <div className="w-10 h-10 bg-primary/10 rounded flex items-center justify-center flex-shrink-0">
                    <Tag className="h-5 w-5 text-primary" />
                  </div>
                )}

                <Link
                  href={`/admin/taxonomies/builder/${siteId}?type=${taxonomyType.slug}&term=${taxonomy.slug}`}
                  className="flex-1 min-w-0 hover:opacity-80 transition-opacity"
                >
                  <div className="font-medium hover:underline truncate">{taxonomy.title}</div>
                  <div className="text-sm text-muted-foreground">
                    {taxonomy.description && (
                      <div className="truncate">
                        <span dangerouslySetInnerHTML={{ __html: taxonomy.description.replace(/<[^>]*>/g, '') }} />
                      </div>
                    )}
                    {!taxonomy.description && (
                      <span>No description</span>
                    )}
                  </div>
                </Link>
              </div>
            </div>

            {/* Parent Column */}
            <div>
              {getFullParentPath(taxonomy).length > 0 ? (
                <div className="flex items-center gap-1 text-sm text-muted-foreground">
                  {getFullParentPath(taxonomy).map((parent, index) => (
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

            {/* Status Column */}
            <div>
              {taxonomy.is_published ? (
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

            {/* Modified Column */}
            <div>
              <span className="text-sm text-muted-foreground">
                {formatDate(taxonomy.updated_at)}
              </span>
            </div>

            {/* Actions Column */}
            <div className="flex items-center space-x-2">
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
                onClick={() => handleSettingsClick(taxonomy)}
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
                <Link href={`/admin/taxonomies/builder/${siteId}?type=${taxonomyType.slug}&term=${taxonomy.slug}`}>
                  <Edit className="w-4 h-4" />
                  <span className="sr-only">Edit</span>
                </Link>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
                onClick={() => handleDeleteClick(taxonomy)}
              >
                <Trash2 className="w-4 h-4 text-red-600" />
                <span className="sr-only">Delete</span>
              </Button>
            </div>
          </div>
        </div>
      ))}

      {/* Settings Modal */}
      <TaxonomySettingsModal
        open={settingsModalOpen}
        onOpenChange={setSettingsModalOpen}
        taxonomy={taxonomyToEdit}
        taxonomyType={taxonomyType}
        existingTaxonomies={allTaxonomies}
        onSuccess={handleSettingsSuccess}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Taxonomy Term?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{taxonomyToDelete?.title}"?
              {taxonomies.some(t => t.parent_id === taxonomyToDelete?.id) && (
                <span className="block mt-2 text-red-600 font-medium">
                  Warning: This term has child terms. Delete or reassign them first.
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              disabled={isDeleting}
              className="bg-red-600 hover:bg-red-700"
            >
              {isDeleting ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
