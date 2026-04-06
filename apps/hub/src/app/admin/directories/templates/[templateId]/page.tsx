"use client"

import { use, useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { BuilderToolbar } from "@/components/admin/shared/BuilderToolbar"
import { StickyHeader as DashboardStickyHeader } from "@/components/admin/layout/dashboard/StickyHeader"
import { BlockPropertiesPanel } from "@/components/admin/directory-builder/layout/BlockPropertiesPanel"
import { BlockListPanel } from "@/components/admin/shared/BlockListPanel"
import { BlockSelectionModal } from "@/components/admin/shared/BlockSelectionModal"
import { DIRECTORY_BLOCK_TYPES, getBlockTypeDefinition } from "@/components/admin/directory-builder/config/directory-block-types"
import {
  directoryBlocksToJson,
  parseDirectoryBlocksFromJson,
  type DirectoryEditorBlock,
} from "@/components/admin/directory-builder/config/directory-block-utils"
import {
  getDirectoryTemplateById,
  updateDirectoryTemplate,
  type DirectoryTemplate,
} from "@/lib/actions/directories/directory-template-actions"
import { getDirectoryCustomBlocksBySite } from "@/lib/actions/directories/directory-custom-block-actions"
import type { DirectoryCustomBlockTemplate } from "@/lib/actions/directories/directory-custom-blocks/types"
import { useSiteSwitcher } from "@/components/admin/providers/site-switcher-provider"
import { getDirectoryAdminTopNavLinks } from "@/components/admin/layout/dashboard/admin-top-nav-links"
import { Blocks, Check, Pencil, X } from "lucide-react"
import {
  getDirectoryCustomBlockSelectionType,
  parseDirectoryCustomBlockSelectionType,
} from "@/lib/actions/directories/directory-custom-blocks/utils"

interface PageProps {
  params: Promise<{ templateId: string }>
}

interface BlockSelection {
  type: string
  quantity: number
}

export default function DirectoryTemplateEditorPage({ params }: PageProps) {
  const { templateId } = use(params)
  const router = useRouter()
  const { currentSite } = useSiteSwitcher()

  const [template, setTemplate] = useState<DirectoryTemplate | null>(null)
  const [customBlockTemplates, setCustomBlockTemplates] = useState<DirectoryCustomBlockTemplate[]>([])
  const [blocks, setBlocks] = useState<DirectoryEditorBlock[]>([])
  const [selectedBlock, setSelectedBlock] = useState<DirectoryEditorBlock | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState("")
  const [blockModalOpen, setBlockModalOpen] = useState(false)
  const [blockListOpen, setBlockListOpen] = useState(true)
  const [editingName, setEditingName] = useState(false)
  const [nameInput, setNameInput] = useState("")
  const [previewTitle, setPreviewTitle] = useState("Preview Directory")

  const directoryNavLinks = getDirectoryAdminTopNavLinks("templates")

  const loadTemplate = useCallback(async () => {
    setLoading(true)

    const { data, error: fetchError } = await getDirectoryTemplateById(templateId)
    if (fetchError || !data) {
      setError(fetchError || "Not found")
      setLoading(false)
      return
    }

    const { data: customBlocksData } = await getDirectoryCustomBlocksBySite(data.site_id)
    const loadedCustomBlocks = customBlocksData || []

    setTemplate(data)
    setCustomBlockTemplates(loadedCustomBlocks)
    setNameInput(data.name)
    setBlocks(parseDirectoryBlocksFromJson(data.content_blocks || {}, loadedCustomBlocks))
    setSelectedBlock(null)
    setLoading(false)
  }, [templateId])

  useEffect(() => {
    loadTemplate()
  }, [loadTemplate])

  function updateBlockContent(field: string, value: any) {
    if (!selectedBlock) return

    setBlocks((prev) => {
      const next = prev.map((block) => {
        if (block.id !== selectedBlock.id) return block
        const updated = {
          ...block,
          content: {
            ...block.content,
            [field]: value,
          },
        }
        setSelectedBlock(updated)
        return updated
      })

      return next
    })
  }

  function handleDeleteBlock(block: DirectoryEditorBlock) {
    setBlocks((prev) => prev.filter((item) => item.id !== block.id))

    if (selectedBlock?.id === block.id) {
      setSelectedBlock(null)
    }
  }

  function handleReorderBlocks(reorderedBlocks: DirectoryEditorBlock[]) {
    setBlocks(reorderedBlocks)
  }

  function handleAddBlocks(selections: BlockSelection[]) {
    const newBlocks: DirectoryEditorBlock[] = []

    for (const selection of selections) {
      const customTemplateId = parseDirectoryCustomBlockSelectionType(selection.type)

      if (customTemplateId) {
        const customTemplate = customBlockTemplates.find((item) => item.id === customTemplateId)
        if (!customTemplate) continue

        for (let index = 0; index < selection.quantity; index += 1) {
          const timestamp = Date.now() + index
          newBlocks.push({
            id: `directory-custom-${timestamp}`,
            type: 'directory-custom',
            title: customTemplate.name,
            content: {
              templateId: customTemplate.id,
              values: {},
            },
          })
        }

        continue
      }

      const blockDefinition = getBlockTypeDefinition(selection.type)
      if (!blockDefinition) continue

      for (let index = 0; index < selection.quantity; index += 1) {
        const timestamp = Date.now() + index
        newBlocks.push({
          id: `${selection.type}-${timestamp}`,
          type: selection.type,
          title: blockDefinition.name,
          content: { ...blockDefinition.defaultContent },
        })
      }
    }

    if (!newBlocks.length) return

    setBlocks((prev) => [...prev, ...newBlocks])
    setSelectedBlock(newBlocks[newBlocks.length - 1])
  }

  async function handleSave() {
    if (!template) return

    setIsSaving(true)
    setSaveMessage("Saving...")

    try {
      const contentBlocks = directoryBlocksToJson(blocks, template.content_blocks || {})
      const { data, error: saveError } = await updateDirectoryTemplate(template.id, {
        content_blocks: contentBlocks,
      })

      if (saveError) {
        setSaveMessage(`Error: ${saveError}`)
        setTimeout(() => setSaveMessage(""), 5000)
      } else if (data) {
        setTemplate(data)
        setSaveMessage("Saved!")
        setTimeout(() => setSaveMessage(""), 3000)
      }
    } catch (err) {
      setSaveMessage(`Error: ${err instanceof Error ? err.message : 'Failed to save'}`)
      setTimeout(() => setSaveMessage(""), 5000)
    } finally {
      setIsSaving(false)
    }
  }

  async function handleSaveName() {
    if (!template || !nameInput.trim()) return

    const { data, error: saveError } = await updateDirectoryTemplate(template.id, { name: nameInput.trim() })
    if (!saveError && data) {
      setTemplate(data)
    }

    setEditingName(false)
  }

  const customBlockDefinitions = customBlockTemplates.map((customTemplate) => ({
    type: getDirectoryCustomBlockSelectionType(customTemplate.id),
    name: customTemplate.name,
    icon: Blocks,
    description: `${customTemplate.layout} • ${customTemplate.fields.length} field${customTemplate.fields.length === 1 ? '' : 's'}`,
    defaultContent: {
      templateId: customTemplate.id,
      values: {},
    },
  }))

  const previewSite = currentSite && currentSite.id === template?.site_id
    ? {
        id: currentSite.id,
        name: currentSite.name,
        subdomain: currentSite.subdomain,
        settings: currentSite.settings,
      }
    : undefined

  if (loading) {
    return (
      <div className="flex flex-col h-full overflow-hidden">
        <DashboardStickyHeader navLinks={directoryNavLinks} />
        <BuilderToolbar
          className="top-16 z-40"
          showSidebarToggle={false}
          breadcrumbItems={[
            { href: "/admin", label: "Dashboard" },
            { href: "/admin/directories/templates", label: "Templates" },
            { label: "Loading...", isPage: true },
          ]}
        />
        <div className="flex-1 flex overflow-hidden">
          <div className="flex-1 border-r bg-background overflow-hidden">
            <div className="flex-1 overflow-y-auto bg-muted/30 p-8 h-full">
              <div className="mx-auto h-96 max-w-4xl rounded-lg bg-white shadow-sm animate-pulse" />
            </div>
          </div>
          <div className="w-[250px] p-2.5">
            <div className="space-y-1">
              {[1, 2, 3].map((item) => (
                <div key={item} className="p-3">
                  <div className="flex items-center space-x-2">
                    <div className="w-7 h-7 bg-muted rounded animate-pulse" />
                    <div className="h-4 w-20 bg-muted rounded animate-pulse" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (error && !template) {
    return (
      <div className="flex flex-col h-full overflow-hidden">
        <DashboardStickyHeader navLinks={directoryNavLinks} />
        <BuilderToolbar
          className="top-16 z-40"
          showSidebarToggle={false}
          breadcrumbItems={[
            { href: "/admin", label: "Dashboard" },
            { href: "/admin/directories/templates", label: "Templates" },
            { label: "Error", isPage: true },
          ]}
        />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <p className="text-red-600 mb-4">{error}</p>
            <Button onClick={() => router.push("/admin/directories/templates")} variant="outline">
              Back to Templates
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <DashboardStickyHeader navLinks={directoryNavLinks} />
      <BuilderToolbar
        className="top-16 z-40"
        showSidebarToggle={false}
        breadcrumbItems={[
          { href: "/admin", label: "Dashboard" },
          { href: "/admin/directories/templates", label: "Templates" },
          { label: template?.name || "Editor", isPage: true },
        ]}
        rightActions={
          <div className="flex items-center gap-2">
            {saveMessage && (
              <span className={`text-sm ${saveMessage.startsWith('Error') ? 'text-red-600' : 'text-green-600'}`}>
                {saveMessage}
              </span>
            )}

            {editingName ? (
              <div className="flex items-center gap-1">
                <Input
                  value={nameInput}
                  onChange={(event) => setNameInput(event.target.value)}
                  className="h-8 w-48 text-sm"
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') handleSaveName()
                    if (event.key === 'Escape') {
                      setEditingName(false)
                      setNameInput(template?.name || "")
                    }
                  }}
                  autoFocus
                />
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={handleSaveName}>
                  <Check className="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0"
                  onClick={() => {
                    setEditingName(false)
                    setNameInput(template?.name || "")
                  }}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            ) : (
              <Button variant="ghost" size="sm" onClick={() => setEditingName(true)} title="Rename template">
                <Pencil className="w-3.5 h-3.5 mr-1" />
                Rename
              </Button>
            )}

            <Button variant="outline" size="sm" onClick={handleSave} disabled={isSaving}>
              {isSaving ? "Saving..." : "Save"}
            </Button>
          </div>
        }
        blockListOpen={blockListOpen}
        onToggleBlockList={() => setBlockListOpen(!blockListOpen)}
      />

      <div className="flex-1 flex overflow-hidden">
        <BlockPropertiesPanel
          selectedBlock={selectedBlock}
          updateBlockContent={updateBlockContent}
          siteId={template?.site_id || currentSite?.id || ''}
          currentDirectory={{
            slug: 'preview-template',
            name: previewTitle,
            title: previewTitle,
            blocks,
            id: 'preview-template',
            site_id: template?.site_id || currentSite?.id || 'preview-site',
            featured_image: null,
            description: null,
            is_published: false,
          }}
          site={previewSite}
          customBlockTemplates={customBlockTemplates}
          blocksLoading={loading}
          onTitleChange={setPreviewTitle}
          onSelectBlock={setSelectedBlock}
          onBack={() => setSelectedBlock(null)}
          showDirectoryTitleField={false}
        />

        {blockListOpen && (
          <BlockListPanel
            blocks={blocks}
            blockTypes={DIRECTORY_BLOCK_TYPES}
            entityName="directory template"
            selectedBlock={selectedBlock}
            onSelectBlock={setSelectedBlock}
            onDeleteBlock={handleDeleteBlock}
            onReorderBlocks={handleReorderBlocks}
            onPreview={() => setSelectedBlock(null)}
            onAddBlock={() => setBlockModalOpen(true)}
            deleting={null}
            blocksLoading={loading}
          />
        )}

        <BlockSelectionModal
          open={blockModalOpen}
          onOpenChange={setBlockModalOpen}
          onAddBlocks={handleAddBlocks}
          existingBlockTypes={blocks.map((block) => block.type)}
          sections={[
            { title: 'Built In', blockTypes: DIRECTORY_BLOCK_TYPES },
            { title: 'Custom', blockTypes: customBlockDefinitions },
          ]}
          entityName="directory template"
        />
      </div>
    </div>
  )
}
