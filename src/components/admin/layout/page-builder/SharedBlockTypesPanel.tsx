import { Button } from "@/components/ui/button"
import { Plus } from "lucide-react"

interface SharedBlockTypesPanelProps {
  onAddHeroBlock: () => void
  onAddRichTextBlock?: () => void
}

export function SharedBlockTypesPanel({ onAddHeroBlock, onAddRichTextBlock }: SharedBlockTypesPanelProps) {
  return (
    <div className="w-64 border-l bg-muted/30 p-4 overflow-y-auto">
      <div>
        <h3 className="font-semibold mb-4">Shared Blocks</h3>
        <div className="space-y-2 text-sm text-muted-foreground">
          <div className="p-3 rounded-lg border bg-background">
            <div className="font-medium">🧭 Navigation</div>
          </div>
          <div className="p-3 rounded-lg border bg-background flex items-center justify-between">
            <div className="font-medium">🎯 Hero</div>
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
            <div className="font-medium">📝 Rich Text</div>
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
          <div className="p-3 rounded-lg border bg-background">
            <div className="font-medium">🦶 Footer</div>
          </div>
        </div>
      </div>
    </div>
  )
}