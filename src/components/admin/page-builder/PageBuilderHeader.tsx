import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { 
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ArrowLeft, Save, Eye, Plus, Settings, CheckCircle } from "lucide-react"
import Link from "next/link"
import { CreatePageForm } from "@/components/admin/page-builder/create-page-form"
import { PageSettingsModal } from "@/components/admin/page-builder/page-settings-modal"
import type { SiteWithTheme } from "@/lib/actions/site-actions"
import type { Page } from "@/lib/actions/page-actions"

interface PageBuilderHeaderProps {
  site: SiteWithTheme | null
  pages: Page[]
  selectedPage: string
  onPageChange: (page: string) => void
  onPageCreated: (page: Page) => void
  onPageUpdated: (page: Page) => void
  saveMessage: string
  isSaving: boolean
  onSave: () => void
  onPreviewPage?: () => void
  pagesLoading?: boolean
}

export function PageBuilderHeader({
  site,
  pages,
  selectedPage,
  onPageChange,
  onPageCreated,
  onPageUpdated,
  saveMessage,
  isSaving,
  onSave,
  onPreviewPage,
  pagesLoading = false
}: PageBuilderHeaderProps) {
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [showEditDialog, setShowEditDialog] = useState(false)
  const currentPage = pages.find(p => p.slug === selectedPage)
  
  return (
    <div className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-[57px] z-40">
      <div className="flex h-14 items-center px-6">
        <div className="flex items-center space-x-4">
          <Button variant="ghost" size="sm" asChild>
            <Link href={site ? `/admin/sites/${site.id}/pages` : '/admin/sites'}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Pages
            </Link>
          </Button>
          <div className="h-4 w-px bg-border"></div>
          <h1 className="text-lg font-semibold">{site?.name || 'Page Builder'}</h1>
          <div className="h-4 w-px bg-border"></div>
          <Select value={selectedPage} onValueChange={onPageChange}>
            <SelectTrigger className="w-[200px]">
              <SelectValue>
                {currentPage ? currentPage.title : selectedPage}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {pages.map((page) => (
                <SelectItem key={page.id} value={page.slug}>
                  {page.is_homepage && "🏠 "}{page.title}
                  {!page.is_published && " (Draft)"}
                </SelectItem>
              ))}
              <div className="border-t pt-1 mt-2">
                <div 
                  className="relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none hover:bg-accent hover:text-accent-foreground text-muted-foreground"
                  onClick={() => setShowCreateDialog(true)}
                >
                  <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
                    <Plus className="h-4 w-4" />
                  </span>
                  Create Page
                </div>
              </div>
            </SelectContent>
          </Select>
          <Button 
            variant="outline"
            size="sm" 
            onClick={onPreviewPage}
          >
            <Eye className="w-4 h-4 mr-2" />
            Preview Page
          </Button>
          <Button
            variant="outline"
            size="sm"
            asChild
          >
            <Link href={site ? `/${selectedPage === 'home' ? '' : selectedPage}` : '#'} target="_blank">
              <Eye className="w-4 h-4 mr-2" />
              View Page
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
      
      {/* Create Page Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="w-[840px] max-w-[95vw]" style={{ width: '840px', maxWidth: '95vw' }}>
          <DialogHeader className="mb-4">
            <DialogTitle>Create New Page</DialogTitle>
          </DialogHeader>
          {site && (
            <CreatePageForm 
              siteId={site.id}
              onSuccess={(page) => {
                onPageCreated(page)
                setShowCreateDialog(false)
              }}
              onCancel={() => setShowCreateDialog(false)}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Page Settings Dialog */}
      <PageSettingsModal
        open={showEditDialog}
        onOpenChange={setShowEditDialog}
        page={currentPage}
        site={site}
        onSuccess={(updatedPage) => {
          onPageUpdated(updatedPage)
        }}
      />
    </div>
  )
}