import { Button } from "@/components/ui/button"
import { Plus, Info } from "lucide-react"

interface BlockTypesPanelProps {
  onAddTaxonomyDefaultBlock: () => void
}

export function BlockTypesPanel({
  onAddTaxonomyDefaultBlock
}: BlockTypesPanelProps) {
  return (
    <div className="w-64 bg-muted/30 p-4 overflow-y-auto border-l">
      <h3 className="text-sm font-semibold mb-4 text-muted-foreground uppercase tracking-wider">
        Block Types
      </h3>
      <div className="space-y-2">
        {/* Tag Information Block */}
        <div className="p-3 rounded-lg border bg-background flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Info className="w-4 h-4" />
            <span className="font-medium">Tag Information</span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-3 -m-2 text-green-600 hover:text-green-700 hover:bg-green-50 cursor-pointer"
            onClick={onAddTaxonomyDefaultBlock}
            title="Add tag information block"
          >
            <Plus className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}
