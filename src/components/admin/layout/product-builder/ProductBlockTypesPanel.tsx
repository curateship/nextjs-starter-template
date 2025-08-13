import { Button } from "@/components/ui/button"
import { Plus } from "lucide-react"

interface ProductBlockTypesPanelProps {
  onAddProductHeroBlock: () => void
}

export function ProductBlockTypesPanel({ 
  onAddProductHeroBlock
}: ProductBlockTypesPanelProps) {
  const productBlocks = [
    { 
      type: "product-hero", 
      name: "Product Hero", 
      icon: "🏷️",
      description: "Main product showcase with title, price, and CTA",
      onClick: onAddProductHeroBlock
    }
  ]

  return (
    <div className="w-64 border-l bg-muted/30 p-4 overflow-y-auto">
      <div>
        <h3 className="font-semibold mb-4">Product Blocks</h3>
        <div className="space-y-3">
          {productBlocks.map((block) => (
            <div
              key={block.type}
              className="border rounded-lg bg-background p-3 space-y-2"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <span className="text-lg">{block.icon}</span>
                  <span className="text-sm font-medium">{block.name}</span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0 text-green-600 hover:text-green-700 hover:bg-green-50"
                  onClick={block.onClick}
                  title={`Add ${block.name.toLowerCase()}`}
                >
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                {block.description}
              </p>
            </div>
          ))}
        </div>
        
        <div className="mt-6 p-3 rounded-lg bg-blue-50 border border-blue-200">
          <p className="text-xs text-blue-800">
            <strong>Tip:</strong> Use the Product Hero block to showcase your main product information including title, price, and call-to-action.
          </p>
        </div>
      </div>
    </div>
  )
}