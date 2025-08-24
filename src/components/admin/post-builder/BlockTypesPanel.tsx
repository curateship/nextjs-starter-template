import { Button } from "@/components/ui/button"
import { Plus, FileText, Image as ImageIcon, Code, Quote, Minus } from "lucide-react"

interface PostBlock {
  id: string
  type: string
  content: Record<string, any>
}

interface BlockTypesPanelProps {
  onAddPostContentBlock?: () => void
  onAddRichTextBlock?: () => void
  onAddImageBlock?: () => void
  onAddCodeBlock?: () => void
  onAddQuoteBlock?: () => void
  onAddDividerBlock?: () => void
  currentBlocks?: PostBlock[]
}

export function BlockTypesPanel({ 
  onAddPostContentBlock,
  onAddRichTextBlock,
  onAddImageBlock,
  onAddCodeBlock,
  onAddQuoteBlock,
  onAddDividerBlock,
  currentBlocks = []
}: BlockTypesPanelProps) {
  // Check if default block already exists
  const hasDefaultBlock = currentBlocks.some(block => 
    block.type === 'rich-text' || block.type === 'post-content'
  )
  return (
    <div className="w-64 border-l bg-muted/30 p-4 overflow-y-auto">
      <div>
        <h3 className="font-semibold mb-4">Post Blocks</h3>
        <div className="space-y-2 text-sm text-muted-foreground">
          
          {/* Content Block */}
          {onAddPostContentBlock && (
            <div className="p-3 rounded-lg border bg-background flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <FileText className="w-4 h-4" />
                <span className="font-medium">Content Block</span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-3 -m-2 text-green-600 hover:text-green-700 hover:bg-green-50 cursor-pointer"
                onClick={onAddPostContentBlock}
                title="Add content block"
              >
                <Plus className="w-4 h-4" />
              </Button>
            </div>
          )}

          {/* Default Block */}
          <div className={`p-3 rounded-lg border flex items-center justify-between ${
            hasDefaultBlock ? 'bg-muted opacity-50' : 'bg-background'
          }`}>
            <div className="flex items-center space-x-2">
              <FileText className="w-4 h-4" />
              <span className="font-medium">Default Block</span>
            </div>
            {!hasDefaultBlock ? (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-3 -m-2 text-green-600 hover:text-green-700 hover:bg-green-50 cursor-pointer"
                onClick={onAddRichTextBlock}
                title="Add default content block"
              >
                <Plus className="w-4 h-4" />
              </Button>
            ) : (
              <div className="text-xs text-muted-foreground px-2">
                Added
              </div>
            )}
          </div>

          {/* Image Block */}
          {onAddImageBlock && (
            <div className="p-3 rounded-lg border bg-background flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <ImageIcon className="w-4 h-4" />
                <span className="font-medium">Image</span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-3 -m-2 text-green-600 hover:text-green-700 hover:bg-green-50 cursor-pointer"
                onClick={onAddImageBlock}
                title="Add image block"
              >
                <Plus className="w-4 h-4" />
              </Button>
            </div>
          )}

          {/* Code Block */}
          {onAddCodeBlock && (
            <div className="p-3 rounded-lg border bg-background flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Code className="w-4 h-4" />
                <span className="font-medium">Code</span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-3 -m-2 text-green-600 hover:text-green-700 hover:bg-green-50 cursor-pointer"
                onClick={onAddCodeBlock}
                title="Add code block"
              >
                <Plus className="w-4 h-4" />
              </Button>
            </div>
          )}

          {/* Quote Block */}
          {onAddQuoteBlock && (
            <div className="p-3 rounded-lg border bg-background flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Quote className="w-4 h-4" />
                <span className="font-medium">Quote</span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-3 -m-2 text-green-600 hover:text-green-700 hover:bg-green-50 cursor-pointer"
                onClick={onAddQuoteBlock}
                title="Add quote block"
              >
                <Plus className="w-4 h-4" />
              </Button>
            </div>
          )}

          {/* Divider Block */}
          {onAddDividerBlock && (
            <div className="p-3 rounded-lg border bg-background flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Minus className="w-4 h-4" />
                <span className="font-medium">Divider</span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-3 -m-2 text-green-600 hover:text-green-700 hover:bg-green-50 cursor-pointer"
                onClick={onAddDividerBlock}
                title="Add divider block"
              >
                <Plus className="w-4 h-4" />
              </Button>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}