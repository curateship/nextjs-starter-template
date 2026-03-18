"use client"

import { useState, use } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { StickyHeader } from "@/components/admin/newsletter-builder/layout/StickyHeader"
import { BlockPropertiesPanel } from "@/components/admin/newsletter-builder/layout/BlockPropertiesPanel"
import { BlockListPanel } from "@/components/admin/newsletter-builder/layout/BlockListPanel"
import { BlockSelectionModal } from "@/components/admin/newsletter-builder/layout/BlockSelectionModal"
import { useAutomationEmailBuilder } from "@/components/admin/newsletter-builder/config/useAutomationEmailBuilder"
import { useSiteContext } from "@/contexts/site-context"
import { Monitor, Tablet, Smartphone, Save, ArrowLeft } from "lucide-react"

interface PageProps {
  params: Promise<{ automationId: string; stepId: string }>
}

const PREVIEW_WIDTHS = {
  desktop: 600,
  tablet: 480,
  mobile: 320,
} as const

export default function AutomationEmailEditorPage({ params }: PageProps) {
  const { automationId, stepId } = use(params)
  const router = useRouter()
  const { currentSite } = useSiteContext()

  const [previewWidth, setPreviewWidth] = useState<keyof typeof PREVIEW_WIDTHS>('desktop')
  const [blockModalOpen, setBlockModalOpen] = useState(false)
  const [blockListOpen, setBlockListOpen] = useState(true)

  const builder = useAutomationEmailBuilder({ stepId, automationId })

  const handleBack = () => {
    router.push(`/admin/newsletters/automations/${automationId}`)
  }

  if (builder.loading) {
    return (
      <div className="flex flex-col h-full overflow-hidden">
        <StickyHeader
          breadcrumbItems={[
            { href: "/admin", label: "Dashboard" },
            { href: "/admin/newsletters/automations", label: "Automations" },
            { label: "Loading...", isPage: true },
          ]}
          rightActions={
            <div className="flex items-center gap-2">
              <div className="h-8 w-24 bg-muted rounded animate-pulse" />
              <div className="h-8 w-20 bg-muted rounded animate-pulse" />
              <div className="h-8 w-24 bg-muted rounded animate-pulse" />
            </div>
          }
        />
        <div className="flex-1 flex overflow-hidden">
          <div className="flex-1 border-r bg-background overflow-hidden">
            <div className="flex-1 overflow-y-auto bg-muted/30 p-8 h-full">
              <div className="mx-auto bg-white shadow-sm rounded-sm" style={{ maxWidth: 600 }}>
                <div className="p-5 flex flex-col items-center">
                  <div className="w-16 h-16 bg-muted rounded-lg animate-pulse mb-3" />
                  <div className="h-6 w-40 bg-muted rounded animate-pulse" />
                </div>
                <div className="p-5 space-y-3">
                  <div className="h-4 bg-muted rounded animate-pulse w-full" />
                  <div className="h-4 bg-muted rounded animate-pulse w-5/6" />
                  <div className="h-4 bg-muted rounded animate-pulse w-4/6" />
                </div>
              </div>
            </div>
          </div>
          <div className="w-[250px] p-2.5">
            <div className="space-y-1">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="p-3">
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

  if (builder.error && !builder.step) {
    return (
      <div className="flex flex-col h-full overflow-hidden">
        <StickyHeader
          breadcrumbItems={[
            { href: "/admin", label: "Dashboard" },
            { href: "/admin/newsletters/automations", label: "Automations" },
            { label: "Error", isPage: true },
          ]}
        />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <p className="text-red-600 mb-4">{builder.error}</p>
            <Button onClick={handleBack} variant="outline">Back to Automation</Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <StickyHeader
        breadcrumbItems={[
          { href: "/admin", label: "Dashboard" },
          { href: "/admin/newsletters/automations", label: "Automations" },
          { href: `/admin/newsletters/automations/${automationId}`, label: builder.automation?.name || "Automation" },
          { label: "Edit Email", isPage: true },
        ]}
        rightActions={
          <div className="flex items-center gap-2">
            {/* Save message */}
            {builder.saveMessage && (
              <span className={`text-sm ${builder.saveMessage.startsWith('Error') ? 'text-red-600' : 'text-green-600'}`}>
                {builder.saveMessage}
              </span>
            )}

            {/* Responsive toggle */}
            <div className="flex items-center border rounded-md h-8 overflow-hidden">
              <Button
                variant={previewWidth === 'desktop' ? 'default' : 'ghost'}
                size="sm"
                className="h-8 w-8 p-0 rounded-r-none"
                onClick={() => setPreviewWidth('desktop')}
                title="Desktop (600px)"
              >
                <Monitor className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant={previewWidth === 'tablet' ? 'default' : 'ghost'}
                size="sm"
                className="h-8 w-8 p-0 rounded-none border-x"
                onClick={() => setPreviewWidth('tablet')}
                title="Tablet (480px)"
              >
                <Tablet className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant={previewWidth === 'mobile' ? 'default' : 'ghost'}
                size="sm"
                className="h-8 w-8 p-0 rounded-l-none"
                onClick={() => setPreviewWidth('mobile')}
                title="Mobile (320px)"
              >
                <Smartphone className="h-3.5 w-3.5" />
              </Button>
            </div>

            {/* Save button */}
            <Button
              variant="outline"
              size="sm"
              onClick={builder.handleSave}
              disabled={builder.isSaving}
            >
              <Save className="w-4 h-4 mr-1" />
              Save
            </Button>
          </div>
        }
        blockListOpen={blockListOpen}
        onToggleBlockList={() => setBlockListOpen(!blockListOpen)}
      />

      <div className="flex-1 flex overflow-hidden">
        <BlockPropertiesPanel
          selectedBlock={builder.selectedBlock}
          blocks={builder.blocks}
          previewWidth={PREVIEW_WIDTHS[previewWidth]}
          updateBlockContent={builder.updateBlockContent}
          onSelectBlock={builder.setSelectedBlock}
          siteId={currentSite?.id || ''}
          subject={builder.subject}
          onSubjectChange={builder.setSubject}
        />

        {blockListOpen && (
          <BlockListPanel
            blocks={builder.blocks}
            selectedBlock={builder.selectedBlock}
            onSelectBlock={builder.setSelectedBlock}
            onDeleteBlock={builder.handleDeleteBlock}
            onReorderBlocks={builder.handleReorderBlocks}
            onPreview={() => builder.setSelectedBlock(null)}
            onAddBlock={() => setBlockModalOpen(true)}
          />
        )}
      </div>

      <BlockSelectionModal
        open={blockModalOpen}
        onOpenChange={setBlockModalOpen}
        onAddBlocks={builder.handleAddBlocks}
      />
    </div>
  )
}
