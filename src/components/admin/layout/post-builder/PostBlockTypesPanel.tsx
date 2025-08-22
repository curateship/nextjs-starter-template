import { Button } from "@/components/ui/button"
import { Plus, FileText } from "lucide-react"

interface PostBlockTypesPanelProps {
  onAddPostContentBlock: () => void
}

export function PostBlockTypesPanel({ 
  onAddPostContentBlock
}: PostBlockTypesPanelProps) {
  return (
    <div className="w-64 border-l bg-muted/30 p-4 overflow-y-auto">
      <div>
        <h3 className="font-semibold mb-4">Post Blocks</h3>
        <div className="space-y-2 text-sm text-muted-foreground">
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
        </div>
      </div>
    </div>
  )
}