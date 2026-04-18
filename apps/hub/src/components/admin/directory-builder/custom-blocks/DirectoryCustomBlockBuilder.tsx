"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Monitor, Smartphone } from "lucide-react"
import { getDirectoryAdminTopNavLinks } from "@/components/admin/layout/stickybar/StickybarTopLeftNav"
import { StickyHeader } from "@/components/admin/layout/stickybar/StickyHeader"
import { StickybarTopRightActions } from "@/components/admin/layout/stickybar/StickybarTopRightActions"
import { Button } from "@/components/ui/button"
import { BlockListPanel } from "@/components/admin/layout/builder/BlockListPanel"
import { BlockSelectionModal, type BlockSelection } from "@/components/admin/layout/builder/BlockSelectionModal"
import { DirectoryCustomBlockPreview } from "@/components/admin/directory-builder/custom-blocks/DirectoryCustomBlockPreview"
import { DirectoryCustomBlockSettingsPanel } from "@/components/admin/directory-builder/custom-blocks/DirectoryCustomBlockSettingsPanel"
import { DIRECTORY_CUSTOM_BLOCK_FIELD_DEFINITIONS } from "@/components/admin/directory-builder/custom-blocks/field-type-definitions"
import { useSiteSwitcher } from "@/components/admin/layout/providers/site-switcher-provider"
import { createDirectoryCustomField } from "@/lib/actions/directories/directory-custom-blocks/utils"
import type { DirectoryCustomBlockField, DirectoryCustomBlockLayout, DirectoryCustomBlockTemplate } from "@/lib/actions/directories/directory-custom-blocks/types"
import { createDirectoryCustomBlock, getDirectoryCustomBlockById, updateDirectoryCustomBlock } from "@/lib/actions/directories/directory-custom-block-actions"

interface DirectoryCustomBlockBuilderProps {
  templateId?: string
}

export function DirectoryCustomBlockBuilder({ templateId }: DirectoryCustomBlockBuilderProps) {
  const router = useRouter()
  const { currentSite } = useSiteSwitcher()

  const [loading, setLoading] = useState(!!templateId)
  const [error, setError] = useState<string | null>(null)
  const [template, setTemplate] = useState<DirectoryCustomBlockTemplate | null>(null)
  const [name, setName] = useState('')
  const [layout, setLayout] = useState<DirectoryCustomBlockLayout>('stack')
  const [fields, setFields] = useState<DirectoryCustomBlockField[]>([])
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null)
  const [blockModalOpen, setBlockModalOpen] = useState(false)
  const [previewWidth, setPreviewWidth] = useState<'desktop' | 'mobile'>('desktop')
  const [saveMessage, setSaveMessage] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    if (!templateId) return
    const blockId = templateId

    let cancelled = false

    async function loadTemplate() {
      setLoading(true)
      const { data, error: fetchError } = await getDirectoryCustomBlockById(blockId)

      if (cancelled) return

      if (fetchError || !data) {
        setError(fetchError || 'Custom block not found')
        setLoading(false)
        return
      }

      setTemplate(data)
      setName(data.name)
      setLayout(data.layout)
      setFields(data.fields || [])
      setLoading(false)
    }

    loadTemplate()

    return () => {
      cancelled = true
    }
  }, [templateId])

  const selectedField = fields.find(field => field.id === selectedFieldId) || null
  const currentSiteId = template?.site_id || currentSite?.id || ''

  const handleAddFields = (selections: BlockSelection[]) => {
    const nextFields = [...fields]

    selections.forEach(selection => {
      for (let index = 0; index < selection.quantity; index += 1) {
        nextFields.push(createDirectoryCustomField(selection.type as DirectoryCustomBlockField['type']))
      }
    })

    setFields(nextFields)
    if (!selectedFieldId && nextFields[0]) {
      setSelectedFieldId(nextFields[nextFields.length - 1].id)
    }
  }

  const handleDeleteField = (fieldToDelete: { id: string }) => {
    const nextFields = fields.filter(field => field.id !== fieldToDelete.id)
    setFields(nextFields)
    if (selectedFieldId === fieldToDelete.id) {
      setSelectedFieldId(null)
    }
  }

  const handleReorderFields = (reordered: Array<{ id: string }>) => {
    const order = new Map(reordered.map((item, index) => [item.id, index]))
    const nextFields = [...fields].sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))
    setFields(nextFields)
  }

  const handleFieldChange = (updatedField: DirectoryCustomBlockField) => {
    setFields(prev => prev.map(field => field.id === updatedField.id ? updatedField : field))
  }

  const handleSave = async () => {
    if (!name.trim()) {
      setSaveMessage('Error: Block name is required')
      return
    }

    if (!currentSiteId) {
      setSaveMessage('Error: Current site not found')
      return
    }

    setIsSaving(true)
    setSaveMessage('Saving...')

    const result = templateId
      ? await updateDirectoryCustomBlock(templateId, { name: name.trim(), layout, fields })
      : await createDirectoryCustomBlock({ siteId: currentSiteId, name: name.trim(), layout, fields })

    if (result.error || !result.data) {
      setSaveMessage(`Error: ${result.error || 'Failed to save'}`)
      setIsSaving(false)
      return
    }

    setTemplate(result.data)
    setName(result.data.name)
    setLayout(result.data.layout)
    setFields(result.data.fields || [])
    setSaveMessage('Saved!')
    setIsSaving(false)

    if (!templateId) {
      router.replace(`/admin/directories/custom-blocks/${result.data.id}`)
    }
  }

  const previewTemplate = {
    name: name.trim() || 'Untitled Custom Block',
    layout,
    fields,
  }

  if (loading) {
    return (
      <div className="flex h-full flex-col overflow-hidden">
        <StickyHeader
          navLinks={getDirectoryAdminTopNavLinks("custom-blocks")}
          rightActions={(
            <StickybarTopRightActions
              rightActions={(
                <div className="flex items-center gap-2">
                  <div className="h-8 w-24 animate-pulse rounded bg-muted" />
                  <div className="h-8 w-24 animate-pulse rounded bg-muted" />
                </div>
              )}
            />
          )}
        />
        <div className="flex flex-1 overflow-hidden">
          <div className="flex-1 animate-pulse bg-muted/30" />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex h-full flex-col overflow-hidden">
        <StickyHeader navLinks={getDirectoryAdminTopNavLinks("custom-blocks")} />
        <div className="flex flex-1 items-center justify-center">
          <div className="space-y-4 text-center">
            <p className="text-red-600">{error}</p>
            <Button asChild variant="outline">
              <Link href="/admin/directories/custom-blocks">Back to Custom Blocks</Link>
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <StickyHeader
        navLinks={getDirectoryAdminTopNavLinks("custom-blocks")}
        rightActions={(
          <StickybarTopRightActions
            rightActions={(
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center overflow-hidden rounded-md border">
                  <Button
                    variant={previewWidth === "desktop" ? "default" : "ghost"}
                    size="sm"
                    className="rounded-none border-r"
                    onClick={() => setPreviewWidth("desktop")}
                  >
                    <Monitor className="mr-2 h-4 w-4" />
                    Desktop
                  </Button>
                  <Button
                    variant={previewWidth === "mobile" ? "default" : "ghost"}
                    size="sm"
                    className="rounded-none"
                    onClick={() => setPreviewWidth("mobile")}
                  >
                    <Smartphone className="mr-2 h-4 w-4" />
                    Mobile
                  </Button>
                </div>
              </div>
            )}
            saveMessage={saveMessage}
            isSaving={isSaving}
            onSave={handleSave}
            saveLabel={templateId ? "Save" : "Create Block"}
          />
        )}
      />

      <div className="flex flex-1 overflow-hidden">
        <div className="border-r pt-4">
          <BlockListPanel
            blocks={fields.map(field => ({
              id: field.id,
              type: field.type,
              title: field.label || DIRECTORY_CUSTOM_BLOCK_FIELD_DEFINITIONS.find(def => def.type === field.type)?.name || 'Field',
            }))}
            blockTypes={DIRECTORY_CUSTOM_BLOCK_FIELD_DEFINITIONS}
            entityName="custom block"
            selectedBlock={selectedField}
            onSelectBlock={(field) => setSelectedFieldId(field.id)}
            onDeleteBlock={handleDeleteField}
            onReorderBlocks={handleReorderFields}
            onPreview={() => setSelectedFieldId(null)}
            onAddBlock={() => setBlockModalOpen(true)}
            deleting={null}
            panelTitle="Fields"
            itemNameSingular="field"
            itemNamePlural="fields"
            addButtonLabel="Add Field"
          />
        </div>

        <DirectoryCustomBlockPreview template={previewTemplate} width={previewWidth} />

        <DirectoryCustomBlockSettingsPanel
          name={name}
          layout={layout}
          selectedField={selectedField}
          onNameChange={setName}
          onLayoutChange={setLayout}
          onFieldChange={handleFieldChange}
        />
      </div>

      <BlockSelectionModal
        open={blockModalOpen}
        onOpenChange={setBlockModalOpen}
        onAddBlocks={handleAddFields}
        blockTypes={DIRECTORY_CUSTOM_BLOCK_FIELD_DEFINITIONS}
        entityName="custom block"
        title="Add Fields"
        itemLabelPlural="fields"
        addActionLabel="Add selected fields"
      />
    </div>
  )
}
