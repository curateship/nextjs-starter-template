import { Button } from "@/components/ui/button"
import { Plus } from "lucide-react"

interface BlockTypesPanelProps {
  onAddHeroBlock: () => void
}

export function BlockTypesPanel({ onAddHeroBlock }: BlockTypesPanelProps) {
  return (
    <div className="w-64 border-l bg-muted/30 p-4 overflow-y-auto">
      <div>
        <h3 className="font-semibold mb-4">Block Types</h3>
        <div className="space-y-2 text-sm text-muted-foreground">
          <div className="p-3 rounded-lg border bg-background">
            <div className="font-medium">🧭 Navigation</div>
            <div className="text-xs">Site header with logo and menu</div>
          </div>
          <div className="p-3 rounded-lg border bg-background">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium">🎯 Hero</div>
                <div className="text-xs">Main banner with title and buttons</div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 text-green-600 hover:text-green-700 hover:bg-green-50 cursor-pointer"
                onClick={onAddHeroBlock}
                title="Add hero block"
              >
                <Plus className="w-5 h-5" />
              </Button>
            </div>
          </div>
          <div className="p-3 rounded-lg border bg-background">
            <div className="font-medium">🦶 Footer</div>
            <div className="text-xs">Site footer with links</div>
          </div>
        </div>
      </div>
    </div>
  )
}