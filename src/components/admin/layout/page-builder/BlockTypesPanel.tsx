import { Button } from "@/components/ui/button"
import { Plus, Zap, FileText, HelpCircle } from "lucide-react"

interface BlockTypesPanelProps {
  onAddHeroBlock: () => void
  onAddRichTextBlock?: () => void
  onAddFaqBlock?: () => void
}

export function BlockTypesPanel({ onAddHeroBlock, onAddRichTextBlock, onAddFaqBlock }: BlockTypesPanelProps) {
  return (
    <div className="w-64 border-l bg-muted/30 p-4 overflow-y-auto">
      <div>
        <h3 className="font-semibold mb-4">Block Types</h3>
        <div className="space-y-2 text-sm text-muted-foreground">
          <div className="p-3 rounded-lg border bg-background flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Zap className="w-4 h-4" />
              <span className="font-medium">Hero</span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-3 -m-2 text-green-600 hover:text-green-700 hover:bg-green-50 cursor-pointer"
              onClick={onAddHeroBlock}
              title="Add hero block"
            >
              <Plus className="w-4 h-4" />
            </Button>
          </div>
          <div className="p-3 rounded-lg border bg-background flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <FileText className="w-4 h-4" />
              <span className="font-medium">Rich Text</span>
            </div>
            {onAddRichTextBlock && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-3 -m-2 text-green-600 hover:text-green-700 hover:bg-green-50 cursor-pointer"
                onClick={onAddRichTextBlock}
                title="Add rich text block"
              >
                <Plus className="w-4 h-4" />
              </Button>
            )}
          </div>
          <div className="p-3 rounded-lg border bg-background flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <HelpCircle className="w-4 h-4" />
              <span className="font-medium">FAQ</span>
            </div>
            {onAddFaqBlock && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-3 -m-2 text-green-600 hover:text-green-700 hover:bg-green-50 cursor-pointer"
                onClick={onAddFaqBlock}
                title="Add FAQ block"
              >
                <Plus className="w-4 h-4" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}