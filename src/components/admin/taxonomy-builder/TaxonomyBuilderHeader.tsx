import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ArrowLeft, Save, Eye, Settings, CheckCircle } from "lucide-react"
import Link from "next/link"
import { useSiteContext } from "@/contexts/site-context"
import { TaxonomySettingsModal } from "@/components/admin/taxonomies/TaxonomySettingsModal"
import type { TaxonomyType } from "@/lib/actions/taxonomies/taxonomy-type-actions"
import type { Taxonomy } from "@/lib/actions/taxonomies/taxonomy-actions"

interface TaxonomyBuilderHeaderProps {
  taxonomyTypes: TaxonomyType[]
  selectedTypeId: string
  onTypeChange: (typeId: string) => void
  taxonomies: Taxonomy[]
  selectedTaxonomy: string
  onTaxonomyChange: (taxonomySlug: string) => void
  onTaxonomyUpdated?: (taxonomy: Taxonomy) => void
  saveMessage: string
  isSaving: boolean
  onSave: () => void
  onPreviewTaxonomy: () => void
  taxonomiesLoading: boolean
}

export function TaxonomyBuilderHeader({
  taxonomyTypes,
  selectedTypeId,
  onTypeChange,
  taxonomies,
  selectedTaxonomy,
  onTaxonomyChange,
  onTaxonomyUpdated,
  saveMessage,
  isSaving,
  onSave,
  onPreviewTaxonomy,
  taxonomiesLoading
}: TaxonomyBuilderHeaderProps) {
  const [showEditDialog, setShowEditDialog] = useState(false)
  const { currentSite } = useSiteContext()
  const currentTaxonomy = taxonomies.find(t => t.slug === selectedTaxonomy)
  const currentType = taxonomyTypes.find(t => t.id === selectedTypeId)

  // Generate taxonomy URL for frontend viewing
  const getTaxonomyUrl = () => {
    if (!currentTaxonomy || !currentType || !currentSite?.subdomain) {
      return '#'
    }

    const url = `http://localhost:3000/taxonomies/${currentType.slug}/${currentTaxonomy.slug}`
    return url
  }

  return (
    <div className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-[57px] z-40">
      <div className="flex h-14 items-center px-6">
        <div className="flex items-center space-x-4">
          <Button variant="ghost" size="sm" asChild>
            <Link href={`/admin/taxonomies/${currentSite?.id || ''}`}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Taxonomies
            </Link>
          </Button>
          <div className="h-4 w-px bg-border"></div>
          <h1 className="text-lg font-semibold">Taxonomy Builder</h1>
          <div className="h-4 w-px bg-border"></div>

          {/* Taxonomy Type Selector */}
          <Select value={selectedTypeId} onValueChange={onTypeChange}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Select type" />
            </SelectTrigger>
            <SelectContent>
              {taxonomyTypes.map((type) => (
                <SelectItem key={type.id} value={type.id}>
                  {type.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Taxonomy Selector */}
          {selectedTypeId && (
            <Select value={selectedTaxonomy} onValueChange={onTaxonomyChange} disabled={taxonomiesLoading}>
              <SelectTrigger className="w-[200px]">
                <SelectValue>
                  {currentTaxonomy ? currentTaxonomy.title : ""}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {taxonomies.map((taxonomy) => (
                  <SelectItem key={taxonomy.id} value={taxonomy.slug}>
                    {taxonomy.title}
                    {!taxonomy.is_published && " (Draft)"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={onPreviewTaxonomy}
            disabled={!currentTaxonomy}
          >
            <Eye className="w-4 h-4 mr-2" />
            Preview Taxonomy
          </Button>

          <Button
            variant="outline"
            size="sm"
            asChild
            disabled={!currentTaxonomy || !currentSite?.subdomain}
          >
            <Link href={getTaxonomyUrl()} target="_blank">
              <Eye className="w-4 h-4 mr-2" />
              View Taxonomy
            </Link>
          </Button>
        </div>

        <div className="ml-auto flex items-center space-x-2">
          {saveMessage && (
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-md ${
              saveMessage.includes('Error') || saveMessage.includes('Failed')
                ? 'bg-red-50 border border-red-200'
                : 'bg-green-50 border border-green-200'
            }`}>
              <CheckCircle className={`w-4 h-4 ${
                saveMessage.includes('Error') || saveMessage.includes('Failed')
                  ? 'text-red-600'
                  : 'text-green-600'
              }`} />
              <span className={`text-sm font-medium ${
                saveMessage.includes('Error') || saveMessage.includes('Failed')
                  ? 'text-red-800'
                  : 'text-green-700'
              }`}>
                {saveMessage}
              </span>
            </div>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowEditDialog(true)}
            disabled={!currentTaxonomy}
          >
            <Settings className="w-4 h-4 mr-2" />
            Edit Settings
          </Button>

          <Button
            size="sm"
            onClick={onSave}
            disabled={isSaving}
          >
            <Save className="w-4 h-4 mr-2" />
            {isSaving ? 'Saving...' : 'Save'}
          </Button>
        </div>
      </div>

      {/* Edit Taxonomy Settings Modal */}
      <TaxonomySettingsModal
        open={showEditDialog}
        onOpenChange={setShowEditDialog}
        taxonomy={currentTaxonomy || null}
        taxonomyType={currentType || null}
        existingTaxonomies={taxonomies}
        onSuccess={(updatedTaxonomy) => {
          if (onTaxonomyUpdated) {
            onTaxonomyUpdated(updatedTaxonomy)
          }
        }}
      />
    </div>
  )
}
