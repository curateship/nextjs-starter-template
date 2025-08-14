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
import { ArrowLeft, Save, Eye, Plus, Settings } from "lucide-react"
import Link from "next/link"
import { CreatePageForm } from "@/components/admin/layout/page-builder/create-page-form"
import { EditPageForm } from "@/components/admin/layout/page-builder/edit-page-form"
import type { SiteWithTheme } from "@/lib/actions/site-actions"
import type { Page } from "@/lib/actions/page-actions"

interface PageBuilderHeaderProps {
  site: SiteWithTheme
  pages: Page[]
  selectedPage: string
  onPageChange: (page: string) => void
  onPageCreated: (page: Page) => void
  onPageUpdated: (page: Page) => void
  saveMessage: string
  isSaving: boolean
  onSave: () => void
  onPreviewPage?: () => void
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
  onPreviewPage
}: PageBuilderHeaderProps) {
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [showEditDialog, setShowEditDialog] = useState(false)
  const currentPage = pages.find(p => p.slug === selectedPage)
  
  return (
    <div className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-[57px] z-40">
      <div className="flex h-14 items-center px-6">
        <div className="flex items-center space-x-4">
          <Button variant="ghost" size="sm" asChild>
            <Link href={`/admin/sites/${site.id}/pages`}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Pages
            </Link>
          </Button>
          <div className="h-4 w-px bg-border"></div>
          <h1 className="text-lg font-semibold">{site.name || 'Page Builder'}</h1>
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
                  className="relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none hover:bg-accent hover:text-accent-foreground text-muted-foreground hover:text-foreground"
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
            <Link href={`/${site.subdomain}/${selectedPage === 'home' ? '' : selectedPage}`} target="_blank">
              <Eye className="w-4 h-4 mr-2" />
              View Page
            </Link>
          </Button>
        </div>
        <div className="ml-auto flex items-center space-x-2">
          {saveMessage && (
            <span className={`text-sm ${saveMessage.includes('Error') || saveMessage.includes('Failed') ? 'text-red-600' : 'text-green-600'}`}>
              {saveMessage}
            </span>
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
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Create New Page</DialogTitle>
            <DialogDescription>
              Add a new page to your site. You can customize the content after creation.
            </DialogDescription>
          </DialogHeader>
          <CreatePageForm 
            siteId={site.id}
            onSuccess={(page) => {
              onPageCreated(page)
              setShowCreateDialog(false)
            }}
            onCancel={() => setShowCreateDialog(false)}
          />
        </DialogContent>
      </Dialog>

      {/* Edit Page Settings Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Page Settings</DialogTitle>
            <DialogDescription>
              Configure settings for "{currentPage?.title || selectedPage}"
            </DialogDescription>
          </DialogHeader>
          {currentPage && (
            <EditPageForm 
              page={currentPage}
              onSuccess={(updatedPage) => {
                onPageUpdated(updatedPage)
                setShowEditDialog(false)
              }}
              onCancel={() => setShowEditDialog(false)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}