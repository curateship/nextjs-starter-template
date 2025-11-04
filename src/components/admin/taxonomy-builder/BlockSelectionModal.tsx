import { useState } from "react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Plus, Minus } from "lucide-react"
import { TAXONOMY_BLOCK_TYPES } from "@/config/taxonomy-block-types"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

interface BlockSelection {
  type: string
  quantity: number
}

interface BlockSelectionModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onAddBlocks: (selections: BlockSelection[]) => void
  existingBlockTypes: string[]
}

export function BlockSelectionModal({
  open,
  onOpenChange,
  onAddBlocks,
  existingBlockTypes
}: BlockSelectionModalProps) {
  const [selections, setSelections] = useState<Record<string, number>>({})

  const handleQuantityChange = (blockType: string, delta: number) => {
    setSelections(prev => {
      const current = prev[blockType] || 0
      const newValue = Math.max(0, Math.min(10, current + delta))

      if (newValue === 0) {
        const { [blockType]: _, ...rest } = prev
        return rest
      }

      return { ...prev, [blockType]: newValue }
    })
  }

  const handleAddBlocks = () => {
    const blockSelections: BlockSelection[] = Object.entries(selections).map(
      ([type, quantity]) => ({ type, quantity })
    )

    if (blockSelections.length > 0) {
      onAddBlocks(blockSelections)
      setSelections({})
      onOpenChange(false)
    }
  }

  const isBlockDisabled = (blockType: string) => {
    const blockDef = TAXONOMY_BLOCK_TYPES.find(b => b.type === blockType)
    if (!blockDef?.conflictsWith) return false

    return blockDef.conflictsWith.some(conflictType =>
      existingBlockTypes.includes(conflictType)
    )
  }

  const totalSelected = Object.values(selections).reduce((sum, qty) => sum + qty, 0)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add Blocks</DialogTitle>
          <DialogDescription>
            Select blocks to add to your taxonomy. You can add multiple blocks at once.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-4">
          {TAXONOMY_BLOCK_TYPES.map((blockType) => {
            const isDisabled = isBlockDisabled(blockType.type)
            const quantity = selections[blockType.type] || 0
            const Icon = blockType.icon

            return (
              <TooltipProvider key={blockType.type}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div
                      className={`border rounded-lg p-4 ${
                        isDisabled
                          ? 'opacity-50 cursor-not-allowed bg-muted'
                          : quantity > 0
                          ? 'border-primary bg-primary/5'
                          : 'hover:border-primary/50 cursor-pointer'
                      }`}
                    >
                      <div className="flex items-start space-x-3">
                        <Icon className="w-5 h-5 mt-0.5 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <h3 className="font-medium text-sm">{blockType.name}</h3>
                          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                            {blockType.description}
                          </p>
                        </div>
                      </div>

                      {!isDisabled && (
                        <div className="flex items-center justify-between mt-3 pt-3 border-t">
                          <span className="text-xs text-muted-foreground">Quantity</span>
                          <div className="flex items-center space-x-2">
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 w-7 p-0"
                              onClick={() => handleQuantityChange(blockType.type, -1)}
                              disabled={quantity === 0}
                            >
                              <Minus className="w-3 h-3" />
                            </Button>
                            <span className="text-sm font-medium w-6 text-center">
                              {quantity}
                            </span>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 w-7 p-0"
                              onClick={() => handleQuantityChange(blockType.type, 1)}
                              disabled={quantity >= 10}
                            >
                              <Plus className="w-3 h-3" />
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  </TooltipTrigger>
                  {isDisabled && (
                    <TooltipContent>
                      <p>This block conflicts with existing blocks</p>
                    </TooltipContent>
                  )}
                </Tooltip>
              </TooltipProvider>
            )
          })}
        </div>

        <div className="flex items-center justify-between pt-4 border-t">
          <p className="text-sm text-muted-foreground">
            {totalSelected === 0 ? (
              "Select blocks to add"
            ) : (
              `${totalSelected} block${totalSelected === 1 ? '' : 's'} selected`
            )}
          </p>
          <div className="flex space-x-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddBlocks} disabled={totalSelected === 0}>
              Add Selected Blocks
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
