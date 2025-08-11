import { useState } from "react"
import { Button } from "@/components/ui/button"
import { 
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Trash2 } from "lucide-react"
import { isBlockTypeProtected, getBlockProtectionReason } from "@/lib/shared-blocks/block-utils"
import type { Block } from "@/lib/actions/site-blocks-actions"

interface CurrentPage {
  slug: string
  name: string
  blocks: Block[]
}

interface BlockListPanelProps {
  currentPage: CurrentPage
  selectedBlock: Block | null
  onSelectBlock: (block: Block) => void
  onDeleteBlock: (block: Block) => void
  deleting: string | null
}

export function BlockListPanel({
  currentPage,
  selectedBlock,
  onSelectBlock,
  onDeleteBlock,
  deleting
}: BlockListPanelProps) {
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [blockToDelete, setBlockToDelete] = useState<Block | null>(null)

  const handleDeleteClick = (block: Block) => {
    setBlockToDelete(block)
    setDeleteConfirmOpen(true)
  }

  const handleConfirmDelete = () => {
    if (blockToDelete) {
      onDeleteBlock(blockToDelete)
    }
    setDeleteConfirmOpen(false)
    setBlockToDelete(null)
  }

  const getBlockTypeName = (block: Block) => {
    return block.type === 'hero' ? 'Hero Section' : 
           block.type === 'navigation' ? 'Navigation' :
           block.type === 'footer' ? 'Footer' : 'Block'
  }
  return (
    <>
      <div className="flex-1 p-6">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-xl font-semibold mb-6">
            {currentPage.name} Page Blocks
          </h2>
          
          {currentPage.blocks.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-muted-foreground mb-4">
                <p className="text-lg font-medium">No blocks added yet</p>
                <p className="text-sm">Add blocks from the right sidebar to start building your page</p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {currentPage.blocks.map((block) => (
                <div
                  key={block.id}
                  className={`border rounded-lg p-4 cursor-pointer transition-colors ${
                    selectedBlock?.id === block.id
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-muted-foreground'
                  }`}
                  onClick={() => onSelectBlock(block)}
                >
                  <div className="flex items-center justify-between">
                    <h3 className="font-medium">{block.title}</h3>
                    <div className="flex items-center space-x-2">
                      <div className="text-xs text-muted-foreground">
                        {block.type}
                      </div>
                      {isBlockTypeProtected(block.type) ? (
                        <div 
                          className="p-1 text-gray-400 cursor-not-allowed" 
                          title={getBlockProtectionReason(block.type)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </div>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleDeleteClick(block)
                          }}
                          disabled={deleting === block.id}
                          title="Delete block"
                        >
                          {deleting === block.id ? (
                            <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-red-600"></div>
                          ) : (
                            <Trash2 className="w-4 h-4" />
                          )}
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Delete Block</DialogTitle>
            <DialogDescription>
              {blockToDelete && (
                <>Are you sure you want to delete the {getBlockTypeName(blockToDelete)} block? It will be removed when you save.</>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end space-x-2 pt-4">
            <Button
              variant="outline"
              onClick={() => setDeleteConfirmOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirmDelete}
            >
              Delete Block
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}