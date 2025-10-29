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
import { useSiteContext } from "@/contexts/site-context"
import { DirectorySettingsModal } from "@/components/admin/directory-builder/DirectorySettingsModal"
import { CreateDirectoryModal } from "@/components/admin/directory-builder/CreateDirectoryModal"
import type { Directory } from "@/lib/actions/directories/directory-actions"

interface DirectoryBuilderHeaderProps {
  directories: Directory[]
  selectedDirectory: string
  onDirectoryChange: (directory: string) => void
  onDirectoryCreated?: (directory: Directory) => void
  onDirectoryUpdated?: (directory: Directory) => void
  saveMessage: string
  isSaving: boolean
  onSave: () => void
  onPreviewDirectory?: () => void
  directoriesLoading?: boolean
}

export function DirectoryBuilderHeader({
  directories,
  selectedDirectory,
  onDirectoryChange,
  onDirectoryCreated,
  onDirectoryUpdated,
  saveMessage,
  isSaving,
  onSave,
  onPreviewDirectory,
  directoriesLoading = false
}: DirectoryBuilderHeaderProps) {
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [showEditDialog, setShowEditDialog] = useState(false)
  const [selectOpen, setSelectOpen] = useState(false)
  const { currentSite } = useSiteContext()
  const currentDirectory = directories.find(d => d.slug === selectedDirectory)

  const handleCreateDirectory = () => {
    setSelectOpen(false)
    setTimeout(() => {
      setShowCreateDialog(true)
    }, 100)
  }

  // Generate directory URL for frontend viewing
  const getDirectoryUrl = () => {
    if (!currentDirectory || !currentSite?.subdomain) {
      return '#'
    }

    // Use dedicated directory routing
    const url = `http://localhost:3000/directories/${currentDirectory.slug}`
    return url
  }

  return (
    <div className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-[57px] z-40">
      <div className="flex h-14 items-center px-6">
        <div className="flex items-center space-x-4">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/admin/directories">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Directories
            </Link>
          </Button>
          <div className="h-4 w-px bg-border"></div>
          <h1 className="text-lg font-semibold">Directory Builder</h1>
          <div className="h-4 w-px bg-border"></div>
          <Select value={selectedDirectory} onValueChange={onDirectoryChange} open={selectOpen} onOpenChange={setSelectOpen}>
            <SelectTrigger className="w-[200px]">
              <SelectValue>
                {currentDirectory ? currentDirectory.title : ""}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {directories.map((directory) => (
                <SelectItem key={directory.id} value={directory.slug}>
                  {directory.title}
                  {!directory.is_published && " (Draft)"}
                </SelectItem>
              ))}
              <div className="border-t pt-1 mt-2">
                <div
                  className="relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none hover:bg-accent hover:text-foreground text-muted-foreground"
                  onClick={handleCreateDirectory}
                >
                  <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
                    <Plus className="h-4 w-4" />
                  </span>
                  Create Directory
                </div>
              </div>
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            onClick={onPreviewDirectory}
            disabled={!currentDirectory}
          >
            <Eye className="w-4 h-4 mr-2" />
            Preview Directory
          </Button>
          <Button
            variant="outline"
            size="sm"
            asChild
            disabled={!currentDirectory || !currentSite?.subdomain}
          >
            <Link href={getDirectoryUrl()} target="_blank">
              <Eye className="w-4 h-4 mr-2" />
              View Directory
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
            disabled={!currentDirectory}
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

      {/* Create Directory Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="w-[840px] max-w-[95vw]" style={{ width: '840px', maxWidth: '95vw' }}>
          <DialogHeader>
            <DialogTitle>Create New Directory</DialogTitle>
            <DialogDescription>
              Add a new directory to your site. You can customize the content after creation.
            </DialogDescription>
          </DialogHeader>
          <CreateDirectoryModal
            onSuccess={(directory) => {
              // Add the new directory to the list if callback exists
              if (onDirectoryCreated) {
                onDirectoryCreated(directory)
              }
              setShowCreateDialog(false)
              // Navigate to the new directory's builder page
              onDirectoryChange(directory.slug)
            }}
            onCancel={() => setShowCreateDialog(false)}
          />
        </DialogContent>
      </Dialog>

      {/* Edit Directory Settings Modal */}
      <DirectorySettingsModal
        open={showEditDialog}
        onOpenChange={setShowEditDialog}
        directory={currentDirectory || null}
        site={currentSite}
        onSuccess={(updatedDirectory) => {
          // Update the directory in the list
          if (onDirectoryUpdated) {
            onDirectoryUpdated(updatedDirectory)
          }
        }}
      />
    </div>
  )
}
