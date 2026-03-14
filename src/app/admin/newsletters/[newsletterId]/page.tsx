"use client"

import { useState, use } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { StickyHeader } from "@/components/admin/newsletter-builder/layout/StickyHeader"
import { BlockPropertiesPanel } from "@/components/admin/newsletter-builder/layout/BlockPropertiesPanel"
import { BlockListPanel } from "@/components/admin/newsletter-builder/layout/BlockListPanel"
import { BlockSelectionModal } from "@/components/admin/newsletter-builder/layout/BlockSelectionModal"
import { NewsletterSettingsModal } from "@/components/admin/newsletter-builder/layout/NewsletterSettingsModal"
import { useNewsletterBuilder } from "@/components/admin/newsletter-builder/config/useNewsletterBuilder"
import { useSiteContext } from "@/contexts/site-context"
import { Monitor, Tablet, Smartphone, Settings, Plus, Save } from "lucide-react"

interface PageProps {
  params: Promise<{ newsletterId: string }>
}

const PREVIEW_WIDTHS = {
  desktop: 600,
  tablet: 480,
  mobile: 320,
} as const

export default function NewsletterBuilderPage({ params }: PageProps) {
  const { newsletterId } = use(params)
  const router = useRouter()
  const { currentSite } = useSiteContext()

  const [previewWidth, setPreviewWidth] = useState<keyof typeof PREVIEW_WIDTHS>('desktop')
  const [blockModalOpen, setBlockModalOpen] = useState(false)
  const [settingsModalOpen, setSettingsModalOpen] = useState(false)

  const builder = useNewsletterBuilder({ newsletterId })

  if (builder.loading) {
    return (
      <div className="flex flex-col h-full overflow-hidden">
        <StickyHeader
          breadcrumbItems={[
            { href: "/admin", label: "Dashboard" },
            { href: "/admin/newsletters", label: "Newsletters" },
            { label: "Loading...", isPage: true },
          ]}
          rightActions={
            <div className="flex items-center gap-2">
              <div className="h-8 w-24 bg-muted rounded animate-pulse" />
              <div className="h-8 w-8 bg-muted rounded animate-pulse" />
              <div className="h-8 w-20 bg-muted rounded animate-pulse" />
              <div className="h-8 w-24 bg-muted rounded animate-pulse" />
            </div>
          }
        />
        <div className="flex-1 flex overflow-hidden">
          {/* Left panel skeleton */}
          <div className="flex-1 border-r bg-background overflow-hidden">
            <div className="flex-1 overflow-y-auto bg-muted/30 p-8 h-full">
              <div className="mx-auto bg-white shadow-sm rounded-sm" style={{ maxWidth: 600 }}>
                {/* Header skeleton */}
                <div className="p-5 flex flex-col items-center">
                  <div className="w-16 h-16 bg-muted rounded-lg animate-pulse mb-3" />
                  <div className="h-6 w-40 bg-muted rounded animate-pulse" />
                </div>
                {/* Content skeleton */}
                <div className="p-5 space-y-3">
                  <div className="h-4 bg-muted rounded animate-pulse w-full" />
                  <div className="h-4 bg-muted rounded animate-pulse w-5/6" />
                  <div className="h-4 bg-muted rounded animate-pulse w-4/6" />
                  <div className="h-4 bg-muted rounded animate-pulse w-full" />
                  <div className="h-4 bg-muted rounded animate-pulse w-3/4" />
                </div>
                {/* Divider skeleton */}
                <div className="py-5 px-5">
                  <div className="h-px bg-muted animate-pulse" />
                </div>
                {/* Footer skeleton */}
                <div className="p-5 flex flex-col items-center">
                  <div className="h-3 w-32 bg-muted rounded animate-pulse mb-2" />
                  <div className="h-3 w-48 bg-muted rounded animate-pulse mb-2" />
                  <div className="h-3 w-20 bg-muted rounded animate-pulse" />
                </div>
              </div>
            </div>
          </div>
          {/* Right panel skeleton */}
          <div className="w-[250px] p-2.5">
            <div className="flex items-center justify-between mb-4 px-5">
              <div className="h-6 w-16 bg-muted rounded animate-pulse" />
            </div>
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

  if (builder.error && !builder.newsletter) {
    return (
      <div className="flex flex-col h-full overflow-hidden">
        <StickyHeader
          breadcrumbItems={[
            { href: "/admin", label: "Dashboard" },
            { href: "/admin/newsletters", label: "Newsletters" },
            { label: "Error", isPage: true },
          ]}
        />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <p className="text-red-600 mb-4">{builder.error}</p>
            <Button onClick={() => router.push("/admin/newsletters")} variant="outline">Back to Newsletters</Button>
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
          { href: "/admin/newsletters", label: "Newsletters" },
          { label: builder.newsletter?.name || "Builder", isPage: true },
        ]}
        rightActions={
          <div className="flex items-center gap-2">
            {/* Responsive toggle */}
            <div className="flex items-center border rounded-md">
              <Button
                variant={previewWidth === 'desktop' ? 'default' : 'ghost'}
                size="sm"
                className="h-8 w-8 p-0 rounded-r-none"
                onClick={() => setPreviewWidth('desktop')}
                title="Desktop (600px)"
              >
                <Monitor className="w-4 h-4" />
              </Button>
              <Button
                variant={previewWidth === 'tablet' ? 'default' : 'ghost'}
                size="sm"
                className="h-8 w-8 p-0 rounded-none border-x"
                onClick={() => setPreviewWidth('tablet')}
                title="Tablet (480px)"
              >
                <Tablet className="w-4 h-4" />
              </Button>
              <Button
                variant={previewWidth === 'mobile' ? 'default' : 'ghost'}
                size="sm"
                className="h-8 w-8 p-0 rounded-l-none"
                onClick={() => setPreviewWidth('mobile')}
                title="Mobile (320px)"
              >
                <Smartphone className="w-4 h-4" />
              </Button>
            </div>

            {/* Settings */}
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={() => setSettingsModalOpen(true)}
              title="Settings"
            >
              <Settings className="w-4 h-4" />
            </Button>

            {/* Save message */}
            {builder.saveMessage && (
              <span className={`text-sm ${builder.saveMessage.startsWith('Error') ? 'text-red-600' : 'text-green-600'}`}>
                {builder.saveMessage}
              </span>
            )}

            {/* Save button */}
            <Button
              variant="outline"
              size="sm"
              onClick={builder.handleSave}
              disabled={builder.isSaving}
            >
              <Save className="w-4 h-4 mr-1" />
              {builder.isSaving ? 'Saving...' : 'Save'}
            </Button>

            {/* Add Block */}
            <Button
              size="sm"
              onClick={() => setBlockModalOpen(true)}
            >
              <Plus className="w-4 h-4 mr-1" />
              Add Block
            </Button>
          </div>
        }
      />

      <div className="flex-1 flex overflow-hidden">
        <BlockPropertiesPanel
          selectedBlock={builder.selectedBlock}
          blocks={builder.blocks}
          previewWidth={PREVIEW_WIDTHS[previewWidth]}
          updateBlockContent={builder.updateBlockContent}
          onSelectBlock={builder.setSelectedBlock}
          siteId={currentSite?.id || ''}
          subject={builder.newsletter?.subject}
          subHeader={builder.newsletter?.sub_header}
          onOpenSettings={() => setSettingsModalOpen(true)}
        />

        <BlockListPanel
          blocks={builder.blocks}
          selectedBlock={builder.selectedBlock}
          onSelectBlock={builder.setSelectedBlock}
          onDeleteBlock={builder.handleDeleteBlock}
          onReorderBlocks={builder.handleReorderBlocks}
          onPreview={() => builder.setSelectedBlock(null)}
        />
      </div>

      <BlockSelectionModal
        open={blockModalOpen}
        onOpenChange={setBlockModalOpen}
        onAddBlocks={builder.handleAddBlocks}
      />

      <NewsletterSettingsModal
        open={settingsModalOpen}
        onOpenChange={setSettingsModalOpen}
        newsletter={builder.newsletter}
        siteId={currentSite?.id || ''}
        onSuccess={(updated) => {
          builder.reloadNewsletter()
          setSettingsModalOpen(false)
        }}
      />
    </div>
  )
}
