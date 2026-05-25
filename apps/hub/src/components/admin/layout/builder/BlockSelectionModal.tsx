"use client"

import { useState, useMemo } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogFooterActions,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import type { BlockTypeDefinition } from "@/lib/utils/block-types"
import { Plus, Minus, Info } from "lucide-react"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

export interface BlockSelection {
  type: string
  quantity: number
}

interface BlockSelectionModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onAddBlocks: (selections: BlockSelection[]) => void
  existingBlockTypes?: string[]
  blockTypes?: BlockTypeDefinition[]
  sections?: Array<{
    title: string
    blockTypes: BlockTypeDefinition[]
  }>
  entityName?: string
  title?: string
  itemLabelPlural?: string
  addActionLabel?: string
}

/**
 * Shared block selection modal used by all builders.
 * Shows a grid of available block types with quantity selectors and conflict detection.
 */
export function BlockSelectionModal({
  open,
  onOpenChange,
  onAddBlocks,
  existingBlockTypes = [],
  blockTypes = [],
  sections,
  entityName = "content",
  title = "Add Blocks",
  itemLabelPlural = "blocks",
  addActionLabel = "Add selected blocks",
}: BlockSelectionModalProps) {
  const [selections, setSelections] = useState<Record<string, number>>({})
  const allBlockTypes = sections?.flatMap(section => section.blockTypes) || blockTypes

  const disabledBlocks = useMemo(() => {
    const disabled = new Set<string>()
    allBlockTypes.forEach(blockType => {
      if (blockType.conflictsWith) {
        blockType.conflictsWith.forEach(conflictType => {
          if (existingBlockTypes.includes(conflictType)) {
            disabled.add(blockType.type)
          }
        })
      }
    })
    return disabled
  }, [existingBlockTypes, allBlockTypes])

  const handleToggleBlock = (type: string) => {
    setSelections(prev => {
      const newSelections = { ...prev }
      if (newSelections[type]) {
        delete newSelections[type]
      } else {
        newSelections[type] = 1
      }
      return newSelections
    })
  }

  const handleQuantityChange = (type: string, delta: number) => {
    setSelections(prev => {
      const newQuantity = (prev[type] || 0) + delta
      if (newQuantity <= 0) {
        const newSelections = { ...prev }
        delete newSelections[type]
        return newSelections
      }
      return { ...prev, [type]: Math.min(newQuantity, 10) }
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

  const getConflictMessage = (blockType: BlockTypeDefinition): string | null => {
    if (!blockType.conflictsWith) return null
    for (const conflictType of blockType.conflictsWith) {
      if (existingBlockTypes.includes(conflictType)) {
        const conflictBlock = allBlockTypes.find(b => b.type === conflictType)
        return `Cannot add ${blockType.name} when ${conflictBlock?.name || 'conflicting block'} exists`
      }
    }
    return null
  }

  const renderBlockCard = (blockType: BlockTypeDefinition) => {
    const Icon = blockType.icon
    const isSelected = !!selections[blockType.type]
    const isDisabled = disabledBlocks.has(blockType.type)
    const conflictMessage = getConflictMessage(blockType)
    const quantity = selections[blockType.type] || 0

    const blockCard = (
      <div
        key={blockType.type}
        className={`
          border rounded-lg p-4 transition-all cursor-pointer
          ${isSelected
            ? 'border-primary bg-primary/5 shadow-sm'
            : 'border-border hover:border-muted-foreground'
          }
          ${isDisabled
            ? 'opacity-50 cursor-not-allowed hover:border-border'
            : ''
          }
        `}
        onClick={() => !isDisabled && handleToggleBlock(blockType.type)}
      >
        <div className="flex items-start space-x-3">
          <div className={`
            flex items-center justify-center w-10 h-10 rounded
            ${isSelected ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}
          `}>
            <Icon className="w-5 h-5" />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-1">
              <h4 className="font-semibold text-sm">{blockType.name}</h4>
              {isDisabled && (
                <Info className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              )}
            </div>
            <p className="text-xs text-muted-foreground line-clamp-2">
              {blockType.description}
            </p>

            {isSelected && (
              <div className="flex items-center space-x-2 mt-3" onClick={(e) => e.stopPropagation()}>
                <span className="text-xs text-muted-foreground">Quantity:</span>
                <div className="flex items-center space-x-1">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-6 w-6 p-0"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleQuantityChange(blockType.type, -1)
                    }}
                  >
                    <Minus className="w-3 h-3" />
                  </Button>
                  <span className="text-sm font-medium w-6 text-center">{quantity}</span>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-6 w-6 p-0"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleQuantityChange(blockType.type, 1)
                    }}
                    disabled={quantity >= 10}
                  >
                    <Plus className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    )

    if (isDisabled && conflictMessage) {
      return (
        <TooltipProvider key={blockType.type}>
          <Tooltip>
            <TooltipTrigger asChild>
              {blockCard}
            </TooltipTrigger>
            <TooltipContent>
              <p>{conflictMessage}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )
    }

    return blockCard
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[900px] max-w-[95vw] sm:max-w-[900px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Select the {itemLabelPlural} you want to add to your {entityName}. You can add multiple {itemLabelPlural} at once and specify quantities.
          </DialogDescription>
        </DialogHeader>

        {sections ? (
          <div className="space-y-6 py-4">
            {sections
              .filter(section => section.blockTypes.length > 0)
              .map(section => (
                <div key={section.title} className="space-y-3">
                  <div>
                    <h3 className="text-sm font-semibold">{section.title}</h3>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-3">
                    {section.blockTypes.map(renderBlockCard)}
                  </div>
                </div>
              ))}
          </div>
        ) : (
          <div className="grid gap-4 py-4 sm:grid-cols-3">
            {blockTypes.map(renderBlockCard)}
          </div>
        )}

        <DialogFooter>
          <div className="flex w-full flex-row items-center justify-between gap-2">
            <span className="text-sm text-muted-foreground">
              {totalBlocksToAdd > 0 ? `${totalBlocksToAdd} block${totalBlocksToAdd === 1 ? '' : 's'} selected` : 'No blocks selected'}
            </span>
            <DialogFooterActions>
              <Button variant="outline" onClick={handleCancel}>
                Cancel
              </Button>
              <Button
                onClick={handleAddBlocks}
                disabled={totalBlocksToAdd === 0}
              >
                {addActionLabel}
              </Button>
            </DialogFooterActions>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
