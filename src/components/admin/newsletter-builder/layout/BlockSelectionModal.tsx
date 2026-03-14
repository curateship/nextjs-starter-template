"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { NEWSLETTER_BLOCK_TYPES } from "../config/newsletter-block-types"
import { Plus, Minus } from "lucide-react"

interface BlockSelection {
  type: string
  quantity: number
}

interface BlockSelectionModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onAddBlocks: (selections: BlockSelection[]) => void
}

export function BlockSelectionModal({ open, onOpenChange, onAddBlocks }: BlockSelectionModalProps) {
  const [selections, setSelections] = useState<Record<string, number>>({})

  const handleToggleBlock = (type: string) => {
    setSelections(prev => {
      const next = { ...prev }
      if (next[type]) {
        delete next[type]
      } else {
        next[type] = 1
      }
      return next
    })
  }

  const handleQuantityChange = (type: string, delta: number) => {
    setSelections(prev => {
      const newQty = (prev[type] || 0) + delta
      if (newQty <= 0) {
        const next = { ...prev }
        delete next[type]
        return next
      }
      return { ...prev, [type]: Math.min(newQty, 10) }
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

  const handleCancel = () => {
    setSelections({})
    onOpenChange(false)
  }

  const totalBlocksToAdd = Object.values(selections).reduce((sum, qty) => sum + qty, 0)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[600px] max-w-[95vw] sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add Blocks</DialogTitle>
          <DialogDescription>
            Select blocks to add to your newsletter.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-4 py-4">
          {NEWSLETTER_BLOCK_TYPES.map((blockType) => {
            const Icon = blockType.icon
            const isSelected = !!selections[blockType.type]
            const quantity = selections[blockType.type] || 0

            return (
              <div
                key={blockType.type}
                className={`border rounded-lg p-4 transition-all cursor-pointer ${
                  isSelected
                    ? 'border-primary bg-primary/5 shadow-sm'
                    : 'border-border hover:border-muted-foreground'
                }`}
                onClick={() => handleToggleBlock(blockType.type)}
              >
                <div className="flex items-start space-x-3">
                  <div className={`flex items-center justify-center w-10 h-10 rounded ${
                    isSelected ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                  }`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="font-semibold text-sm">{blockType.name}</h4>
                    <p className="text-xs text-muted-foreground line-clamp-2">{blockType.description}</p>
                    {isSelected && (
                      <div className="flex items-center space-x-2 mt-3" onClick={(e) => e.stopPropagation()}>
                        <span className="text-xs text-muted-foreground">Qty:</span>
                        <div className="flex items-center space-x-1">
                          <Button variant="outline" size="sm" className="h-6 w-6 p-0" onClick={() => handleQuantityChange(blockType.type, -1)}>
                            <Minus className="w-3 h-3" />
                          </Button>
                          <span className="text-sm font-medium w-6 text-center">{quantity}</span>
                          <Button variant="outline" size="sm" className="h-6 w-6 p-0" onClick={() => handleQuantityChange(blockType.type, 1)} disabled={quantity >= 10}>
                            <Plus className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        <DialogFooter>
          <div className="flex items-center justify-between w-full">
            <span className="text-sm text-muted-foreground">
              {totalBlocksToAdd > 0 ? `${totalBlocksToAdd} block${totalBlocksToAdd === 1 ? '' : 's'} selected` : 'No blocks selected'}
            </span>
            <div className="flex space-x-2">
              <Button variant="outline" onClick={handleCancel}>Cancel</Button>
              <Button onClick={handleAddBlocks} disabled={totalBlocksToAdd === 0}>Add selected blocks</Button>
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
